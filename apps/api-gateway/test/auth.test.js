import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const apps = [];

function build(userClient) {
  const app = buildApp({
    env: {
      PORT: '8080',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      USER_SERVICE_GRPC: '127.0.0.1:50051',
    },
    logger: false,
    userClient,
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const user = {
  id: 'user-1',
  email: 'user@example.test',
  display_name: 'РРІР°РЅРѕРІ РРІР°РЅ',
  last_name: 'РРІР°РЅРѕРІ',
  first_name: 'РРІР°РЅ',
  middle_name: '',
  position: '',
  status: 'USER_STATUS_ACTIVE',
  email_verified: true,
  timezone: 'Europe/Moscow',
  locale: 'ru-RU',
  global_roles: [],
};

describe('api-gateway auth routes', () => {
  it('maps register request and response', async () => {
    let received;
    const app = build({
      Register(request, callback) {
        received = request;
        callback(null, { user_id: 'user-1', requires_email_verification: true });
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'user@example.test',
        password: 'password123',
        lastName: 'РРІР°РЅРѕРІ',
        firstName: 'РРІР°РЅ',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      userId: 'user-1',
      requiresEmailVerification: true,
    });
    expect(received).toMatchObject({
      email: 'user@example.test',
      last_name: 'РРІР°РЅРѕРІ',
      first_name: 'РРІР°РЅ',
    });
  });

  it('forwards Set-Cookie and maps login response', async () => {
    const app = build({
      Login(_request, callback) {
        callback(null, {
          user,
          session_id: 'session-1',
          set_cookie: ['__Host-session=token; Path=/; Secure; HttpOnly'],
        });
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'user@example.test', password: 'password123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie'][0]).toContain('__Host-session=token');
    expect(response.json()).toMatchObject({
      sessionId: 'session-1',
      user: { email: 'user@example.test', status: 'active' },
    });
  });

  it('requires CSRF for logout', async () => {
    const app = build({
      Logout(_request, callback) {
        callback(null, { set_cookie: ['__Host-session=; Max-Age=0'] });
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { '__Host-session': 'token', '__Host-csrf': 'csrf' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'csrf_invalid' });
  });

  it('validates session and loads current user', async () => {
    const app = build({
      ValidateSession(_request, callback) {
        callback(null, { user_id: 'user-1', session_id: 'session-1' });
      },
      GetCurrentUser(_request, callback) {
        callback(null, { user });
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      cookies: { '__Host-session': 'token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'user-1',
      email: 'user@example.test',
      status: 'active',
    });
  });

  it('lists and revokes my sessions', async () => {
    let revoked;
    const app = build({
      ValidateSession(_request, callback) {
        callback(null, { user_id: 'user-1', session_id: 'session-1' });
      },
      ListMySessions(_request, callback) {
        callback(null, {
          items: [
            {
              id: 'session-1',
              user_agent: 'test',
              ip: '127.0.0.1',
              remember: false,
              created_at: { seconds: '1793290000', nanos: 0 },
            },
          ],
        });
      },
      RevokeMySession(request, callback) {
        revoked = request;
        callback(null, { revoked: true });
      },
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      cookies: { '__Host-session': 'token' },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      items: [{ id: 'session-1', ip: '127.0.0.1', remember: false }],
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/sessions/session-1',
      cookies: { '__Host-session': 'token', '__Host-csrf': 'csrf' },
      headers: { 'x-csrf-token': 'csrf' },
    });
    expect(deleted.statusCode).toBe(204);
    expect(revoked).toEqual({ user_id: 'user-1', session_id: 'session-1' });
  });

  it('logs out all sessions and clears cookies', async () => {
    const app = build({
      ValidateSession(_request, callback) {
        callback(null, { user_id: 'user-1', session_id: 'session-1' });
      },
      LogoutAll(_request, callback) {
        callback(null, { set_cookie: ['__Host-session=; Max-Age=0'] });
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      cookies: { '__Host-session': 'token', '__Host-csrf': 'csrf' },
      headers: { 'x-csrf-token': 'csrf' },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['set-cookie'][0]).toContain('__Host-session=');
  });
});
