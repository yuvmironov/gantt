import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.BASE_URL || 'https://app.rp-gant.localhost';
const vus = Number(__ENV.VUS || 2);
const password = 'LoadPassword123!';

export const options = {
  scenarios: {
    authenticated: {
      executor: 'per-vu-iterations',
      vus,
      iterations: 1,
      maxDuration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
  },
};

export function setup() {
  const users = [];
  const stamp = Date.now();
  for (let index = 0; index < vus; index += 1) {
    const email = `load-${stamp}-${index}@rp-gant.test`;
    const response = http.post(
      `${base}/api/v1/auth/register`,
      JSON.stringify({
        email,
        password,
        lastName: 'Load',
        firstName: `User${index}`,
        displayName: `Load User ${index}`,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (response.status !== 201) {
      throw new Error(`register failed: ${response.status} ${response.body}`);
    }
    users.push({ email, password });
  }
  return users;
}

function csrf() {
  const cookies = http.cookieJar().cookiesForURL(base);
  return cookies['__Host-csrf']?.[0] ?? '';
}

export default function (users) {
  http.cookieJar().clear(base);
  const account = users[__VU - 1] ?? users[0];
  const login = http.post(
    `${base}/api/v1/auth/login`,
    JSON.stringify({ email: account.email, password: account.password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } },
  );
  check(login, { 'login ok': (r) => r.status === 200 });

  const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() };
  const name = `Load ${__VU}-${__ITER}-${Date.now()}`;
  const created = http.post(
    `${base}/api/v1/projects`,
    JSON.stringify({ name, description: 'k6 load scenario' }),
    { headers, tags: { name: 'create-project' } },
  );
  check(created, { 'project created': (r) => r.status === 201 });

  http.post(`${base}/api/v1/auth/logout`, null, {
    headers,
    tags: { name: 'logout' },
  });
  sleep(1);
}
