import { request } from 'node:https';

const password = 'DemoPassword123!';
const ownerEmail = 'demo.owner@smart-oati.local';
const memberEmail = 'demo.member@smart-oati.local';

function api(path, { method = 'GET', body, cookies = '' } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 443,
        path: `/api/v1${path}`,
        method,
        servername: 'app.localhost',
        rejectUnauthorized: false,
        headers: {
          Host: 'app.localhost',
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
          ...(cookies ? { Cookie: cookies } : {}),
        },
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            body: data ? JSON.parse(data) : null,
            cookies: (response.headers['set-cookie'] ?? [])
              .map((item) => item.split(';')[0])
              .join('; '),
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function register(email, firstName) {
  const response = await api('/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      lastName: 'Demo',
      firstName,
      displayName: `Demo ${firstName}`,
    },
  });
  if (![201, 409].includes(response.status)) throw new Error(JSON.stringify(response.body));
}

await register(ownerEmail, 'Owner');
await register(memberEmail, 'Member');

const login = await api('/auth/login', {
  method: 'POST',
  body: { email: ownerEmail, password },
});
if (login.status !== 200) throw new Error(JSON.stringify(login.body));
const cookies = login.cookies;

const projects = await api('/projects?limit=100', { cookies });
let project = (projects.body.items ?? []).find((item) => item.name === 'Demo project');
if (!project) {
  project = (
    await api('/projects', {
      method: 'POST',
      cookies,
      body: { name: 'Demo project', description: 'Local demo data' },
    })
  ).body;
}

const diagrams = await api(`/projects/${project.id}/diagrams?limit=100`, { cookies });
let diagram = (diagrams.body.items ?? []).find((item) => item.name === 'Demo Gantt');
if (!diagram) {
  diagram = (
    await api(`/projects/${project.id}/diagrams`, {
      method: 'POST',
      cookies,
      body: { name: 'Demo Gantt', dayMode: 'working' },
    })
  ).body;
}

const snapshot = await api(`/diagrams/${diagram.id}/snapshot`, { cookies });
let direction = (snapshot.body.directions ?? []).find((item) => item.name === 'Demo direction');
if (!direction) {
  direction = (
    await api(`/diagrams/${diagram.id}/directions`, {
      method: 'POST',
      cookies,
      body: { name: 'Demo direction' },
    })
  ).body;
}

const tasks = await api(`/diagrams/${diagram.id}/tasks?limit=100`, { cookies });
const existing = new Set((tasks.body.items ?? []).map((item) => item.name));
for (const name of ['Demo task 1', 'Demo task 2']) {
  if (existing.has(name)) continue;
  await api(`/diagrams/${diagram.id}/tasks`, {
    method: 'POST',
    cookies,
    body: { directionId: direction.id, name, priority: 'medium' },
  });
}

await api(`/projects/${project.id}/invitations`, {
  method: 'POST',
  cookies,
  body: { email: memberEmail, role: 'editor' },
});

console.log('Demo ready: https://app.localhost');
console.log(`Owner: ${ownerEmail} / ${password}`);
console.log(`Member: ${memberEmail} / ${password}`);
