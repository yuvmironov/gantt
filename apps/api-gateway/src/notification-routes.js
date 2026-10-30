import { csrfValid } from './auth-routes.js';

function unauthorized(reply, request) {
  return reply.code(401).type('application/problem+json').send({
    type: 'https://smart-oati.local/problems/unauthenticated',
    title: 'Unauthorized',
    status: 401,
    detail: 'Session is required',
    instance: request.url,
    code: 'unauthenticated',
    traceId: request.id,
  });
}

function forbidden(reply, request) {
  return reply.code(403).type('application/problem+json').send({
    type: 'https://smart-oati.local/problems/csrf_invalid',
    title: 'Forbidden',
    status: 403,
    detail: 'Invalid CSRF token',
    instance: request.url,
    code: 'csrf_invalid',
    traceId: request.id,
  });
}

async function userId(request, userClient) {
  const token = request.cookies['__Host-session'];
  if (!token) return null;
  const session = await new Promise((resolve, reject) => {
    userClient.ValidateSession({ session_token: token, extend_idle: false }, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
  return session.user_id;
}

export async function notificationRoutes(app, { userClient, notificationClient }) {
  app.get('/api/v1/notifications', async (request, reply) => {
    try {
      const current = await userId(request, userClient);
      if (!current) return unauthorized(reply, request);
      const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 200);
      const offset = Math.max(Number(request.query.offset ?? 0), 0);
      const query = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        unreadOnly: request.query.unreadOnly === 'true' ? 'true' : 'false',
        eventType: String(request.query.eventType ?? ''),
      });
      const response = await notificationClient.request(
        `/internal/notifications?${query}`,
        current,
      );
      return reply.send(response);
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ detail: 'Notification service unavailable' });
    }
  });

  app.get('/api/v1/notifications/unread-count', async (request, reply) => {
    try {
      const current = await userId(request, userClient);
      if (!current) return unauthorized(reply, request);
      return reply.send(
        await notificationClient.request('/internal/notifications/unread-count', current),
      );
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ detail: 'Notification service unavailable' });
    }
  });

  app.post('/api/v1/notifications/:notificationId/read', async (request, reply) => {
    if (!csrfValid(request)) return forbidden(reply, request);
    try {
      const current = await userId(request, userClient);
      if (!current) return unauthorized(reply, request);
      await notificationClient.request('/internal/notifications/read', current, {
        method: 'POST',
        body: { ids: [request.params.notificationId] },
      });
      return reply.code(204).send();
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ detail: 'Notification service unavailable' });
    }
  });

  app.post('/api/v1/notifications/read-all', async (request, reply) => {
    if (!csrfValid(request)) return forbidden(reply, request);
    try {
      const current = await userId(request, userClient);
      if (!current) return unauthorized(reply, request);
      return reply.send(
        await notificationClient.request('/internal/notifications/read-all', current, {
          method: 'POST',
        }),
      );
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ detail: 'Notification service unavailable' });
    }
  });

  app.get('/api/v1/notifications/preferences', async (request, reply) => {
    try {
      const current = await userId(request, userClient);
      if (!current) return unauthorized(reply, request);
      return reply.send(
        await notificationClient.request('/internal/notifications/preferences', current),
      );
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ detail: 'Notification service unavailable' });
    }
  });

  app.put('/api/v1/notifications/preferences', async (request, reply) => {
    if (!csrfValid(request)) return forbidden(reply, request);
    try {
      const current = await userId(request, userClient);
      if (!current) return unauthorized(reply, request);
      return reply.send(
        await notificationClient.request('/internal/notifications/preferences', current, {
          method: 'PUT',
          body: { items: request.body?.items ?? [] },
        }),
      );
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ detail: 'Notification service unavailable' });
    }
  });
}
