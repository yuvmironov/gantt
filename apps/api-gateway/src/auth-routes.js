import { call } from './user-client.js';

const TITLES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  423: 'Locked',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

const GRPC_STATUS = {
  3: 400,
  5: 404,
  6: 409,
  7: 403,
  8: 429,
  9: 423,
  10: 409,
  13: 500,
  14: 503,
  16: 401,
};

function fromTimestamp(value) {
  if (!value) return undefined;
  const milliseconds =
    Number(value.seconds ?? 0) * 1000 + Math.floor(Number(value.nanos ?? 0) / 1_000_000);
  return new Date(milliseconds).toISOString();
}

export function mapUser(user) {
  if (!user) return undefined;
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    lastName: user.last_name,
    firstName: user.first_name,
    middleName: user.middle_name,
    position: user.position,
    status: user.status === 'USER_STATUS_BLOCKED' ? 'blocked' : 'active',
    emailVerified: user.email_verified,
    emailVerifiedAt: fromTimestamp(user.email_verified_at),
    timezone: user.timezone,
    locale: user.locale,
    globalRoles: (user.global_roles ?? [])
      .filter((role) => role === 'GLOBAL_ROLE_APP_ADMIN')
      .map(() => 'app_admin'),
    lastLoginAt: fromTimestamp(user.last_login_at),
    createdAt: fromTimestamp(user.created_at),
    updatedAt: fromTimestamp(user.updated_at),
  };
}

function sendProblem(reply, request, error) {
  const grpcCode = error.code ?? 13;
  const status = GRPC_STATUS[grpcCode] ?? 500;
  const code = status >= 500 ? 'internal_error' : error.message || 'request_failed';
  const detail = status >= 500 ? 'Internal server error' : error.message || 'Request failed';

  request.log.warn({ grpcCode, code }, 'gateway request failed');
  return reply
    .code(status)
    .type('application/problem+json')
    .send({
      type: `https://smart-oati.local/problems/${code}`,
      title: TITLES[status] ?? 'Error',
      status,
      detail,
      instance: request.url,
      code,
      traceId: request.id,
    });
}

function setCookies(reply, cookies = []) {
  if (cookies.length > 0) reply.raw.setHeader('set-cookie', cookies);
}

function csrfValid(request) {
  const cookieToken = request.cookies['__Host-csrf'];
  const headerToken = request.headers['x-csrf-token'];
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}

export async function authRoutes(app, { userClient }) {
  app.post('/api/v1/auth/register', async (request, reply) => {
    try {
      const response = await call(userClient, 'Register', {
        email: request.body?.email,
        password: request.body?.password,
        last_name: request.body?.lastName,
        first_name: request.body?.firstName,
        middle_name: request.body?.middleName,
        display_name: request.body?.displayName,
        timezone: request.body?.timezone,
        locale: request.body?.locale,
      });
      return reply.code(201).send({
        userId: response.user_id,
        requiresEmailVerification: response.requires_email_verification,
      });
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/auth/email/verify', async (request, reply) => {
    try {
      const response = await call(userClient, 'VerifyEmail', {
        token: request.body?.token,
      });
      return reply.send({ userId: response.user_id, verified: response.verified });
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    try {
      const response = await call(userClient, 'Login', {
        email: request.body?.email,
        password: request.body?.password,
        remember_me: Boolean(request.body?.rememberMe),
        user_agent: request.headers['user-agent'] ?? '',
        client_ip: request.ip,
      });
      setCookies(reply, response.set_cookie);
      return reply.send({
        user: mapUser(response.user),
        sessionId: response.session_id,
      });
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.get('/api/v1/auth/session', async (request, reply) => {
    const token = request.cookies['__Host-session'];
    if (!token) {
      return reply.code(401).type('application/problem+json').send({
        type: 'https://smart-oati.local/problems/unauthenticated',
        title: TITLES[401],
        status: 401,
        detail: 'Session is required',
        instance: request.url,
        code: 'unauthenticated',
        traceId: request.id,
      });
    }

    try {
      const session = await call(userClient, 'ValidateSession', {
        session_token: token,
        extend_idle: true,
      });
      const response = await call(userClient, 'GetCurrentUser', {
        user_id: session.user_id,
      });
      return reply.send(mapUser(response.user));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (!csrfValid(request)) {
      return reply.code(403).type('application/problem+json').send({
        type: 'https://smart-oati.local/problems/csrf_invalid',
        title: TITLES[403],
        status: 403,
        detail: 'Invalid CSRF token',
        instance: request.url,
        code: 'csrf_invalid',
        traceId: request.id,
      });
    }

    try {
      const response = await call(userClient, 'Logout', {
        session_token: request.cookies['__Host-session'],
      });
      setCookies(reply, response.set_cookie);
      return reply.code(204).send();
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });
}
