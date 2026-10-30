import { call } from './user-client.js';
import { mapUserSummary, sendProblem } from './auth-routes.js';

const PROJECT_ROLES = {
  PROJECT_ROLE_OWNER: 'owner',
  PROJECT_ROLE_MANAGER: 'manager',
  PROJECT_ROLE_EDITOR: 'editor',
  PROJECT_ROLE_PARTICIPANT: 'participant',
  PROJECT_ROLE_VIEWER: 'viewer',
};
const PROJECT_ROLE_CODES = Object.fromEntries(
  Object.entries(PROJECT_ROLES).map(([code, value]) => [value, code]),
);

function fromTimestamp(value) {
  if (!value) return undefined;
  const milliseconds =
    Number(value.seconds ?? 0) * 1000 + Math.floor(Number(value.nanos ?? 0) / 1_000_000);
  return new Date(milliseconds).toISOString();
}

function mapMembership(membership) {
  return {
    id: membership.id,
    projectId: membership.project_id,
    userId: membership.user_id,
    role: PROJECT_ROLES[membership.role] ?? 'viewer',
    status: membership.status,
    invitedAt: fromTimestamp(membership.invited_at),
    joinedAt: fromTimestamp(membership.joined_at),
    revokedAt: fromTimestamp(membership.revoked_at),
    revokedReason: membership.revoked_reason,
    user: membership.user ? mapUserSummary(membership.user) : undefined,
  };
}

function mapInvitation(invitation) {
  return {
    id: invitation.id,
    projectId: invitation.project_id,
    email: invitation.email,
    role: PROJECT_ROLES[invitation.role] ?? 'viewer',
    status: invitation.status,
    expiresAt: fromTimestamp(invitation.expires_at),
    acceptedAt: fromTimestamp(invitation.accepted_at),
    revokedAt: fromTimestamp(invitation.revoked_at),
    invitedByUserId: invitation.invited_by_user_id,
  };
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

function csrfInvalid(reply, request) {
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

function forbidden(reply, request) {
  return reply.code(403).type('application/problem+json').send({
    type: 'https://smart-oati.local/problems/project_access_denied',
    title: 'Forbidden',
    status: 403,
    detail: 'Project access denied',
    instance: request.url,
    code: 'project_access_denied',
    traceId: request.id,
  });
}

async function sessionFor(userClient, request) {
  const token = request.cookies['__Host-session'];
  if (!token) return null;
  return call(userClient, 'ValidateSession', { session_token: token, extend_idle: false });
}

async function requirePermission(userClient, request, reply, projectId, permission) {
  const session = await sessionFor(userClient, request);
  if (!session) return { denied: unauthorized(reply, request) };
  const access = await call(userClient, 'CheckProjectPermission', {
    user_id: session.user_id,
    project_id: projectId,
    permission,
  });
  if (!access.allowed) return { denied: forbidden(reply, request) };
  return { session };
}

export async function accessRoutes(app, { userClient }) {
  app.get('/api/v1/projects/:projectId/members', async (request, reply) => {
    try {
      const access = await requirePermission(
        userClient,
        request,
        reply,
        request.params.projectId,
        'project.view',
      );
      if (access.denied) return access.denied;
      const limit = Math.min(Math.max(Number(request.query.limit ?? 100), 1), 200);
      const offset = Math.max(Number(request.query.offset ?? 0), 0);
      const response = await call(userClient, 'ListProjectMembers', {
        project_id: request.params.projectId,
        page: { limit, offset },
      });
      return reply.send({ items: response.items.map(mapMembership), page: response.page });
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.patch('/api/v1/projects/:projectId/members/:userId', async (request, reply) => {
    if (!csrfValidLocal(request)) return csrfInvalid(reply, request);
    try {
      const access = await requirePermission(
        userClient,
        request,
        reply,
        request.params.projectId,
        'project.members.manage',
      );
      if (access.denied) return access.denied;
      const role = PROJECT_ROLE_CODES[request.body?.role];
      if (!role) {
        return reply.code(400).type('application/problem+json').send({
          type: 'https://smart-oati.local/problems/invalid_role',
          title: 'Bad Request',
          status: 400,
          detail: 'Invalid project role',
          instance: request.url,
          code: 'invalid_role',
          traceId: request.id,
        });
      }
      const response = await call(userClient, 'UpdateProjectMemberRole', {
        project_id: request.params.projectId,
        user_id: request.params.userId,
        role,
        actor_user_id: access.session.user_id,
      });
      return reply.send(mapMembership(response.membership));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.delete('/api/v1/projects/:projectId/members/:userId', async (request, reply) => {
    if (!csrfValidLocal(request)) return csrfInvalid(reply, request);
    try {
      const access = await requirePermission(
        userClient,
        request,
        reply,
        request.params.projectId,
        'project.members.manage',
      );
      if (access.denied) return access.denied;
      await call(userClient, 'RemoveProjectMember', {
        project_id: request.params.projectId,
        user_id: request.params.userId,
        actor_user_id: access.session.user_id,
      });
      return reply.code(204).send();
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.get('/api/v1/projects/:projectId/invitations', async (request, reply) => {
    try {
      const access = await requirePermission(
        userClient,
        request,
        reply,
        request.params.projectId,
        'project.members.manage',
      );
      if (access.denied) return access.denied;
      const limit = Math.min(Math.max(Number(request.query.limit ?? 100), 1), 200);
      const offset = Math.max(Number(request.query.offset ?? 0), 0);
      const response = await call(userClient, 'ListProjectInvitations', {
        project_id: request.params.projectId,
        page: { limit, offset },
      });
      return reply.send({ items: response.items.map(mapInvitation), page: response.page });
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/projects/:projectId/invitations', async (request, reply) => {
    if (!csrfValidLocal(request)) return csrfInvalid(reply, request);
    try {
      const access = await requirePermission(
        userClient,
        request,
        reply,
        request.params.projectId,
        'project.members.manage',
      );
      if (access.denied) return access.denied;
      const role = PROJECT_ROLE_CODES[request.body?.role];
      if (!role) {
        return reply.code(400).type('application/problem+json').send({
          type: 'https://smart-oati.local/problems/invalid_role',
          title: 'Bad Request',
          status: 400,
          detail: 'Invalid project role',
          instance: request.url,
          code: 'invalid_role',
          traceId: request.id,
        });
      }
      const response = await call(userClient, 'CreateInvitation', {
        project_id: request.params.projectId,
        email: request.body?.email,
        role,
        actor_user_id: access.session.user_id,
      });
      return reply.code(201).send(mapInvitation(response.invitation));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/invitations/:invitationId/resend', async (request, reply) => {
    if (!csrfValidLocal(request)) return csrfInvalid(reply, request);
    try {
      const session = await sessionFor(userClient, request);
      if (!session) return unauthorized(reply, request);
      const response = await call(userClient, 'ResendInvitation', {
        invitation_id: request.params.invitationId,
        actor_user_id: session.user_id,
      });
      return reply.code(202).send(mapInvitation(response.invitation));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.delete('/api/v1/invitations/:invitationId', async (request, reply) => {
    if (!csrfValidLocal(request)) return csrfInvalid(reply, request);
    try {
      const session = await sessionFor(userClient, request);
      if (!session) return unauthorized(reply, request);
      await call(userClient, 'RevokeInvitation', {
        invitation_id: request.params.invitationId,
        actor_user_id: session.user_id,
      });
      return reply.code(204).send();
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/invitations/accept', async (request, reply) => {
    if (!csrfValidLocal(request)) return csrfInvalid(reply, request);
    try {
      const session = await sessionFor(userClient, request);
      if (!session) return unauthorized(reply, request);
      const response = await call(userClient, 'AcceptInvitation', {
        token: request.body?.token,
        user_id: session.user_id,
      });
      return reply.send(mapMembership(response.membership));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });
}

function csrfValidLocal(request) {
  const cookieToken = request.cookies['__Host-csrf'];
  const headerToken = request.headers['x-csrf-token'];
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}
