import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const password = 'DemoPassword123!';
const ownerEmail = 'demo.owner@smart-oati.local';
const memberEmail = 'demo.member@smart-oati.local';
const cookieJar = join(tmpdir(), `smart-oati-demo-${process.pid}.cookies`);

function curl(path, { method = 'GET', body, headers = {} } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const args = [
    '-skS',
    '-b',
    cookieJar,
    '-c',
    cookieJar,
    '-X',
    method,
    `https://app.localhost/api/v1${path}`,
    '-H',
    'Accept: application/json',
  ];
  if (payload) args.push('-H', 'Content-Type: application/json', '--data-binary', payload);
  for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`);
  const result = spawnSync('curl', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `curl_failed:${path}`);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

function csrfToken() {
  try {
    return readFileSync(cookieJar, 'utf8')
      .split('\n')
      .map((line) => line.split('\t'))
      .find((parts) => parts[5] === '__Host-csrf')?.[6];
  } catch {
    return '';
  }
}

function request(path, options = {}) {
  const token = csrfToken();
  const separator = path.includes('?') ? '&' : '?';
  const url = token ? `${path}${separator}x-csrf-token=${encodeURIComponent(token)}` : path;
  return curl(url, options);
}

async function register(email, firstName) {
  try {
    curl('/auth/register', {
      method: 'POST',
      body: {
        email,
        password,
        lastName: 'Demo',
        firstName,
        displayName: `Demo ${firstName}`,
      },
    });
  } catch {
    // Existing demo users are reused.
  }
}

await register(ownerEmail, 'Owner');
await register(memberEmail, 'Member');

await curl('/auth/login', {
  method: 'POST',
  body: { email: ownerEmail, password },
});

const projects = await request('/projects?limit=100');
let project = (projects.items ?? []).find((item) => item.name === 'Demo project');
if (!project) {
  project = await curl('/projects', {
    method: 'POST',
    body: { name: 'Demo project', description: 'Local demo data' },
    headers: { 'X-CSRF-Token': csrfToken() },
  });
}

const diagrams = await request(`/projects/${project.id}/diagrams?limit=100`);
let diagram = (diagrams.items ?? []).find((item) => item.name === 'Demo Gantt');
if (!diagram) {
  diagram = await curl(`/projects/${project.id}/diagrams`, {
    method: 'POST',
    body: { name: 'Demo Gantt', dayMode: 'working' },
    headers: { 'X-CSRF-Token': csrfToken() },
  });
}

const snapshot = await request(`/diagrams/${diagram.id}/snapshot`);
let direction = (snapshot.directions ?? []).find((item) => item.name === 'Demo direction');
if (!direction) {
  direction = await curl(`/diagrams/${diagram.id}/directions`, {
    method: 'POST',
    body: { name: 'Demo direction' },
    headers: { 'X-CSRF-Token': csrfToken() },
  });
}

const tasks = await request(`/diagrams/${diagram.id}/tasks?limit=100`);
const existing = new Set((tasks.items ?? []).map((item) => item.name));
for (const name of ['Demo task 1', 'Demo task 2']) {
  if (existing.has(name)) continue;
  await curl(`/diagrams/${diagram.id}/tasks`, {
    method: 'POST',
    body: { directionId: direction.id, name, priority: 'medium' },
    headers: { 'X-CSRF-Token': csrfToken() },
  });
}

await curl(`/projects/${project.id}/invitations`, {
  method: 'POST',
  body: { email: memberEmail, role: 'editor' },
  headers: { 'X-CSRF-Token': csrfToken() },
});

rmSync(cookieJar, { force: true });
console.log('Demo ready: https://app.localhost');
console.log(`Owner: ${ownerEmail} / ${password}`);
console.log(`Member: ${memberEmail} / ${password}`);
