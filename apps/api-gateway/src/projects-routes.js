import { csrfValid, sendProblem } from './auth-routes.js';
import { call } from './project-client.js';

function fromTimestamp(value) {
  if (!value) return undefined;
  const milliseconds =
    Number(value.seconds ?? 0) * 1000 + Math.floor(Number(value.nanos ?? 0) / 1_000_000);
  return new Date(milliseconds).toISOString();
}

function toStatus(value) {
  return (
    {
      PROJECT_STATUS_ACTIVE: 'active',
      PROJECT_STATUS_ARCHIVED: 'archived',
      PROJECT_STATUS_DELETED: 'deleted',
    }[value] ?? value
  );
}

function toRole(value) {
  return (
    {
      PROJECT_ROLE_OWNER: 'project_owner',
      PROJECT_ROLE_MANAGER: 'project_manager',
      PROJECT_ROLE_EDITOR: 'project_editor',
      PROJECT_ROLE_PARTICIPANT: 'project_participant',
      PROJECT_ROLE_VIEWER: 'project_viewer',
    }[value] ?? value
  );
}

export function mapProject(project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    ownerUserId: project.owner_user_id,
    status: toStatus(project.status),
    settings: project.settings ?? {},
    myRole: toRole(project.my_role),
    createdByUserId: project.created_by_user_id,
    updatedByUserId: project.updated_by_user_id,
    createdAt: fromTimestamp(project.created_at),
    updatedAt: fromTimestamp(project.updated_at),
    archivedAt: fromTimestamp(project.archived_at),
    deletedAt: fromTimestamp(project.deleted_at),
    purgeAfter: fromTimestamp(project.purge_after),
  };
}

function unauthenticated() {
  const error = new Error('unauthenticated');
  error.code = 16;
  return error;
}

async function session(request, userClient) {
  const token = request.cookies['__Host-session'];
  if (!token) throw unauthenticated();
  return call(userClient, 'ValidateSession', {
    session_token: token,
    extend_idle: true,
  });
}

export async function projectRoutes(app, { userClient, projectClient }) {
  app.get('/api/v1/projects', async (request, reply) => {
    try {
      const current = await session(request, userClient);
      const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 200);
      const offset = Math.max(Number(request.query.offset ?? 0), 0);
      const response = await call(projectClient, 'ListProjects', {
        user_id: current.user_id,
        page: { limit, offset },
      });
      return reply.send({
        items: response.items.map(mapProject),
        page: response.page,
      });
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/projects', async (request, reply) => {
    if (!csrfValid(request)) {
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

    try {
      const current = await session(request, userClient);
      const response = await call(projectClient, 'CreateProject', {
        name: request.body?.name,
        description: request.body?.description,
        settings: request.body?.settings ?? {},
        owner_user_id: current.user_id,
      });
      return reply.code(201).send(mapProject(response.project));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });
}
