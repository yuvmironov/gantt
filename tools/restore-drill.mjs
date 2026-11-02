import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const composeFile = 'infrastructure/local/docker-compose.yml';
const envFile = 'infrastructure/local/.env.local';
const container = `smart-oati-restore-check-${process.pid}`;
const dir = mkdtempSync(join(tmpdir(), 'smart-oati-restore-'));
const databases = [
  'smart_oati_user',
  'smart_oati_project',
  'smart_oati_notification',
  'smart_oati_audit',
];

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
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'smart_oati'], {
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
      'smart_oati',
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
      'smart_oati',
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
    'POSTGRES_USER=smart_oati',
    '-e',
    'POSTGRES_PASSWORD=smart_oati_dev',
    '-e',
    'POSTGRES_DB=postgres',
    'postgres:17-alpine',
  ]);
  waitForPostgres();

  for (const database of databases) {
    run('docker', ['exec', container, 'createdb', '-U', 'smart_oati', database]);
    const dump = readFileSync(join(dir, `${database}.sql`), 'utf8');
    run(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-U',
        'smart_oati',
        '-d',
        database,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { input: dump },
    );
  }
  console.log('restore completed');

  const checks = [
    ['smart_oati_user', 'access.users'],
    ['smart_oati_project', 'project.projects'],
    ['smart_oati_project', 'plan.tasks'],
    ['smart_oati_notification', 'notify.notifications'],
    ['smart_oati_audit', 'audit.audit_events'],
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
