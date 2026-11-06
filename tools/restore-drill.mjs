import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const composeFile = 'infrastructure/local/docker-compose.yml';
const envFile = 'infrastructure/local/.env.local';
const container = `rp-gant-restore-check-${process.pid}`;
const dir = mkdtempSync(join(tmpdir(), 'rp-gant-restore-'));
const databases = ['rp_gant_user', 'rp_gant_project', 'rp_gant_notification', 'rp_gant_audit'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    input: options.input,
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'rp_gant'], {
      encoding: 'utf8',
      shell: false,
    });
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('temporary postgres did not become ready');
}

function count(database, table) {
  return Number(
    run('docker', [
      'exec',
      container,
      'psql',
      '-U',
      'rp_gant',
      '-d',
      database,
      '-Atc',
      `SELECT count(*) FROM ${table}`,
    ]).trim(),
  );
}

try {
  for (const database of databases) {
    const dump = run('docker', [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-U',
      'rp_gant',
      '--clean',
      '--if-exists',
      database,
    ]);
    writeFileSync(join(dir, `${database}.sql`), dump, 'utf8');
  }
  console.log('backups created');

  run('docker', [
    'run',
    '-d',
    '--name',
    container,
    '-e',
    'POSTGRES_USER=rp_gant',
    '-e',
    'POSTGRES_PASSWORD=rp_gant_dev',
    '-e',
    'POSTGRES_DB=postgres',
    'postgres:17-alpine',
  ]);
  waitForPostgres();

  for (const database of databases) {
    run('docker', ['exec', container, 'createdb', '-U', 'rp_gant', database]);
    const dump = readFileSync(join(dir, `${database}.sql`), 'utf8');
    run(
      'docker',
      ['exec', '-i', container, 'psql', '-U', 'rp_gant', '-d', database, '-v', 'ON_ERROR_STOP=1'],
      { input: dump },
    );
  }
  console.log('restore completed');

  const checks = [
    ['rp_gant_user', 'access.users'],
    ['rp_gant_project', 'project.projects'],
    ['rp_gant_project', 'plan.tasks'],
    ['rp_gant_notification', 'notify.notifications'],
    ['rp_gant_audit', 'audit.audit_events'],
  ];
  for (const [database, table] of checks) {
    const value = count(database, table);
    console.log(`${database}.${table}: ${value}`);
    if (value < 0) throw new Error(`invalid count for ${database}.${table}`);
  }
  console.log('restore drill passed');
} finally {
  spawnSync('docker', ['rm', '-f', container], {
    cwd: root,
    shell: false,
    stdio: 'ignore',
  });
  rmSync(dir, { recursive: true, force: true });
}
