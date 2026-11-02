#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const composeFile = 'infrastructure/local/docker-compose.yml';
const envFile = 'infrastructure/local/.env.local';
const example = 'infrastructure/local/.env.example';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input: options.input,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function compose(args, input) {
  return run('docker', ['compose', '--env-file', envFile, '-f', composeFile, ...args], { input });
}

function ensureEnv() {
  if (!existsSync(resolve(root, envFile))) {
    const content = readFileSync(resolve(root, example), 'utf8');
    writeFileSync(envFile, content, 'utf8');
  }
}

const command = process.argv[2] ?? 'up';

if (command === 'up') {
  ensureEnv();
  compose(['--profile', 'infra', '--profile', 'apps', 'up', '-d', '--build']);
  console.log('\nSMART OATI: https://app.localhost');
  console.log('Mailpit: https://mail.localhost');
} else if (command === 'down') {
  compose(['--profile', 'infra', '--profile', 'apps', 'down']);
} else if (command === 'reset') {
  compose(['--profile', 'infra', '--profile', 'apps', 'down', '-v']);
} else if (command === 'status') {
  compose(['--profile', 'infra', '--profile', 'apps', 'ps']);
} else if (command === 'logs') {
  compose(['--profile', 'infra', '--profile', 'apps', 'logs', '-f', '--tail=200']);
} else if (command === 'backup') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(resolve(root, 'backups'), { recursive: true });
  const target = resolve(root, `backups/smart-oati-${stamp}.sql`);
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      envFile,
      '-f',
      composeFile,
      'exec',
      '-T',
      'postgres',
      'pg_dumpall',
      '-U',
      'smart_oati',
    ],
    { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }
  writeFileSync(target, result.stdout, 'utf8');
  console.log(target);
} else if (command === 'restore') {
  const file = process.argv[3];
  if (!file) {
    console.error('Usage: pnpm local:restore -- <backup.sql>');
    process.exit(1);
  }
  compose(
    ['exec', '-T', 'postgres', 'psql', '-U', 'smart_oati', '-d', 'postgres'],
    readFileSync(resolve(root, file)),
  );
} else {
  console.error('Usage: node tools/local.mjs up|down|reset|status|logs|backup|restore <file>');
  process.exit(1);
}
