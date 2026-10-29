import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const apps = [];

function app() {
  const instance = buildApp({
    env: { PORT: '8080', LOG_LEVEL: 'silent', NODE_ENV: 'test' },
    logger: false,
  });
  apps.push(instance);
  return instance;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((instance) => instance.close()));
});

describe('project-service', () => {
  it('serves liveness and readiness', async () => {
    const instance = app();

    const live = await instance.inject({ method: 'GET', url: '/health/live' });
    const ready = await instance.inject({ method: 'GET', url: '/health/ready' });

    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({ status: 'ok', service: 'project-service' });
    expect(ready.statusCode).toBe(200);
  });
});
