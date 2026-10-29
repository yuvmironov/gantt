import { afterEach, describe, expect, it } from 'vitest';
import { createService, loadConfig } from '../src/index.js';

const apps = [];

function buildApp(routes) {
  const app = createService({
    name: 'test-service',
    version: '1.0.0',
    logger: false,
    config: {
      host: '127.0.0.1',
      logLevel: 'silent',
      nodeEnv: 'test',
      port: 0,
    },
    routes,
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('service-kit', () => {
  it('serves liveness and readiness', async () => {
    const app = buildApp();

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({ status: 'ok', service: 'test-service' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ready', service: 'test-service' });
  });

  it('keeps a client request id and returns it in the response', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'req-test-1' },
    });

    expect(response.headers['x-request-id']).toBe('req-test-1');
  });

  it('returns RFC 7807 for unknown routes', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      status: 404,
      code: 'not_found',
      instance: '/missing',
    });
  });

  it('does not expose internal error details', async () => {
    const app = buildApp((instance, _options, done) => {
      instance.get('/boom', async () => {
        throw new Error('database password leaked');
      });
      done();
    });

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      status: 500,
      code: 'internal_error',
      detail: 'Internal server error',
    });
    expect(response.body).not.toContain('password');
  });

  it('rejects invalid port configuration', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow('invalid_port');
  });
});
