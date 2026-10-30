async function adminUserId(request, userClient) {
  const token = request.cookies['__Host-session'];
  if (!token) return null;
  const session = await new Promise((resolve, reject) => {
    userClient.ValidateSession({ session_token: token, extend_idle: false }, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
  const user = await new Promise((resolve, reject) => {
    userClient.GetCurrentUser({ user_id: session.user_id }, (error, value) => {
      if (error) reject(error);
      else resolve(value.user);
    });
  });
  const admin = (user.global_roles ?? []).includes('GLOBAL_ROLE_APP_ADMIN');
  return admin ? session.user_id : null;
}

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
    type: 'https://smart-oati.local/problems/forbidden',
    title: 'Forbidden',
    status: 403,
    detail: 'Administrator access required',
    instance: request.url,
    code: 'forbidden',
    traceId: request.id,
  });
}

export async function auditRoutes(app, { userClient, auditClient }) {
  app.get('/api/v1/audit/events', async (request, reply) => {
    try {
      if (!(await adminUserId(request, userClient))) return unauthorized(reply, request);
      const query = new URLSearchParams({
        limit: String(request.query.limit ?? 50),
        offset: String(request.query.offset ?? 0),
        actionCode: String(request.query.actionCode ?? ''),
        projectId: String(request.query.projectId ?? ''),
        actorUserId: String(request.query.actorUserId ?? ''),
      });
      return reply.send(await auditClient.request(`/internal/audit/events?${query}`));
    } catch (error) {
      request.log.error(error);
      return reply.code(error.code === 7 ? 403 : 502).send({ detail: 'Audit service unavailable' });
    }
  });

  app.get('/api/v1/audit/privileged-events', async (request, reply) => {
    try {
      if (!(await adminUserId(request, userClient))) return forbidden(reply, request);
      const query = new URLSearchParams({
        limit: String(request.query.limit ?? 50),
        offset: String(request.query.offset ?? 0),
      });
      return reply.send(await auditClient.request(`/internal/audit/privileged-events?${query}`));
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ detail: 'Audit service unavailable' });
    }
  });

  app.get('/api/v1/audit/actions', async (request, reply) => {
    try {
      if (!(await adminUserId(request, userClient))) return forbidden(reply, request);
      return reply.send(await auditClient.request('/internal/audit/actions'));
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ detail: 'Audit service unavailable' });
    }
  });

  app.get('/api/v1/audit/stats', async (request, reply) => {
    try {
      if (!(await adminUserId(request, userClient))) return forbidden(reply, request);
      return reply.send(await auditClient.request('/internal/audit/stats'));
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ detail: 'Audit service unavailable' });
    }
  });
}
