import { createMetadata } from '@smart-oati/service-kit';
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

function toDayMode(value) {
  return value === 'DAY_MODE_CALENDAR' ? 'calendar' : 'working';
}

export function mapDiagram(diagram) {
  return {
    id: diagram.id,
    projectId: diagram.project_id,
    name: diagram.name,
    description: diagram.description,
    dayMode: toDayMode(diagram.day_mode),
    currentRevision: Number(diagram.current_revision ?? 0),
    createdByUserId: diagram.created_by_user_id,
    updatedByUserId: diagram.updated_by_user_id,
    createdAt: fromTimestamp(diagram.created_at),
    updatedAt: fromTimestamp(diagram.updated_at),
    archivedAt: fromTimestamp(diagram.archived_at),
    deletedAt: fromTimestamp(diagram.deleted_at),
  };
}

function toPriority(value) {
  return (
    {
      PRIORITY_LOW: 'low',
      PRIORITY_MEDIUM: 'medium',
      PRIORITY_HIGH: 'high',
      PRIORITY_CRITICAL: 'critical',
    }[value] ?? value
  );
}

function priorityEnum(value) {
  return (
    {
      low: 'PRIORITY_LOW',
      medium: 'PRIORITY_MEDIUM',
      high: 'PRIORITY_HIGH',
      critical: 'PRIORITY_CRITICAL',
    }[value] ?? 'PRIORITY_UNSPECIFIED'
  );
}

function dependencyLineStyleEnum(value) {
  return (
    {
      dashed: 'DEPENDENCY_LINE_STYLE_DASHED',
      dotted: 'DEPENDENCY_LINE_STYLE_DOTTED',
    }[value] ?? 'DEPENDENCY_LINE_STYLE_SOLID'
  );
}

function dependencyArrowEnum(value) {
  return (
    {
      straight: 'DEPENDENCY_ARROW_SHAPE_STRAIGHT',
      curved: 'DEPENDENCY_ARROW_SHAPE_CURVED',
    }[value] ?? 'DEPENDENCY_ARROW_SHAPE_ORTHOGONAL'
  );
}

function timestampInput(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return {
    seconds: String(Math.floor(date.getTime() / 1000)),
    nanos: (date.getTime() % 1000) * 1_000_000,
  };
}

function toTaskStatus(value) {
  return (
    {
      TASK_STATUS_PLANNED: 'planned',
      TASK_STATUS_IN_PROGRESS: 'in_progress',
      TASK_STATUS_DONE: 'done',
      TASK_STATUS_BLOCKED: 'blocked',
    }[value] ?? value
  );
}

export function mapDirection(direction) {
  return {
    id: direction.id,
    diagramId: direction.diagram_id,
    wbsCode: direction.wbs_code,
    sortOrder: direction.sort_order,
    name: direction.name,
    description: direction.description,
    result: direction.result,
    priority: toPriority(direction.priority),
    startDate: fromTimestamp(direction.start_date),
    endDate: fromTimestamp(direction.end_date),
    jiraNumber: direction.jira_number,
    bpFlag: direction.bp_flag,
    spFlag: direction.sp_flag,
    version: direction.version,
    assignments: [],
    createdByUserId: direction.created_by_user_id,
    updatedByUserId: direction.updated_by_user_id,
    createdAt: fromTimestamp(direction.created_at),
    updatedAt: fromTimestamp(direction.updated_at),
  };
}

export function mapTask(task) {
  return {
    id: task.id,
    diagramId: task.diagram_id,
    directionId: task.direction_id,
    parentTaskId: task.parent_task_id,
    level: task.level,
    wbsCode: task.wbs_code,
    sortOrder: task.sort_order,
    name: task.name,
    description: task.description,
    result: task.result,
    status: toTaskStatus(task.status),
    progress: task.progress,
    priority: toPriority(task.priority),
    startDate: fromTimestamp(task.start_date),
    endDate: fromTimestamp(task.end_date),
    actualEndDate: fromTimestamp(task.actual_end_date),
    jiraNumber: task.jira_number,
    bpFlag: task.bp_flag,
    spFlag: task.sp_flag,
    version: task.version,
    assignments: [],
    commentsCount: task.comments_count,
    createdByUserId: task.created_by_user_id,
    updatedByUserId: task.updated_by_user_id,
    createdAt: fromTimestamp(task.created_at),
    updatedAt: fromTimestamp(task.updated_at),
  };
}

export function mapDependency(dependency) {
  return {
    id: dependency.id,
    diagramId: dependency.diagram_id,
    predecessorType: dependency.predecessor_type,
    predecessorId: dependency.predecessor_id,
    successorType: dependency.successor_type,
    successorId: dependency.successor_id,
    linkType: 'finish_to_start',
    color: dependency.color,
    lineStyle:
      {
        DEPENDENCY_LINE_STYLE_DASHED: 'dashed',
        DEPENDENCY_LINE_STYLE_DOTTED: 'dotted',
      }[dependency.line_style] ?? 'solid',
    arrowShape:
      {
        DEPENDENCY_ARROW_SHAPE_STRAIGHT: 'straight',
        DEPENDENCY_ARROW_SHAPE_CURVED: 'curved',
      }[dependency.arrow_shape] ?? 'orthogonal',
    createdByUserId: dependency.created_by_user_id,
    createdAt: fromTimestamp(dependency.created_at),
    updatedAt: fromTimestamp(dependency.updated_at),
  };
}

export function mapSnapshot(snapshot) {
  return {
    diagram: mapDiagram(snapshot.diagram),
    directions: (snapshot.directions ?? []).map(mapDirection),
    tasks: (snapshot.tasks ?? []).map(mapTask),
    dependencies: (snapshot.dependencies ?? []).map(mapDependency),
    comments: snapshot.comments ?? [],
    holidays: snapshot.holidays ?? [],
    currentRevision: Number(snapshot.current_revision ?? 0),
    namesResolved: snapshot.names_resolved,
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

function actorMetadata(userId) {
  return createMetadata({ 'x-actor-user-id': userId });
}

function requireCsrf(request, reply) {
  if (csrfValid(request)) return false;
  reply.code(403).type('application/problem+json').send({
    type: 'https://smart-oati.local/problems/csrf_invalid',
    title: 'Forbidden',
    status: 403,
    detail: 'Invalid CSRF token',
    instance: request.url,
    code: 'csrf_invalid',
    traceId: request.id,
  });
  return true;
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
    if (requireCsrf(request, reply)) return reply;

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
  app.get('/api/v1/projects/:projectId', async (request, reply) => {
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'GetProject',
        { project_id: request.params.projectId },
        actorMetadata(current.user_id),
      );
      return reply.send(mapProject(response.project));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.patch('/api/v1/projects/:projectId', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'UpdateProject',
        {
          project_id: request.params.projectId,
          name: request.body?.name,
          description: request.body?.description,
          settings: request.body?.settings,
        },
        actorMetadata(current.user_id),
      );
      return reply.send(mapProject(response.project));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/projects/:projectId/archive', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'ArchiveProject',
        { project_id: request.params.projectId },
        actorMetadata(current.user_id),
      );
      return reply.send(mapProject(response.project));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/projects/:projectId/unarchive', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'UnarchiveProject',
        { project_id: request.params.projectId },
        actorMetadata(current.user_id),
      );
      return reply.send(mapProject(response.project));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.delete('/api/v1/projects/:projectId', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      await call(
        projectClient,
        'DeleteProject',
        { project_id: request.params.projectId },
        actorMetadata(current.user_id),
      );
      return reply.code(204).send();
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/projects/:projectId/restore', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'RestoreProject',
        { project_id: request.params.projectId },
        actorMetadata(current.user_id),
      );
      return reply.send(mapProject(response.project));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });
  app.get('/api/v1/projects/:projectId/diagrams', async (request, reply) => {
    try {
      const current = await session(request, userClient);
      const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 200);
      const offset = Math.max(Number(request.query.offset ?? 0), 0);
      const response = await call(
        projectClient,
        'ListDiagrams',
        {
          project_id: request.params.projectId,
          page: { limit, offset },
        },
        actorMetadata(current.user_id),
      );
      return reply.send({
        items: response.items.map(mapDiagram),
        page: response.page,
      });
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/projects/:projectId/diagrams', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'CreateDiagram',
        {
          project_id: request.params.projectId,
          name: request.body?.name,
          description: request.body?.description,
          day_mode: request.body?.dayMode === 'calendar' ? 'DAY_MODE_CALENDAR' : 'DAY_MODE_WORKING',
        },
        actorMetadata(current.user_id),
      );
      return reply.code(201).send(mapDiagram(response.diagram));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });
  app.get('/api/v1/diagrams/:diagramId', async (request, reply) => {
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'GetDiagram',
        { diagram_id: request.params.diagramId },
        actorMetadata(current.user_id),
      );
      return reply.send(mapDiagram(response.diagram));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.patch('/api/v1/diagrams/:diagramId', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'UpdateDiagram',
        {
          diagram_id: request.params.diagramId,
          name: request.body?.name,
          description: request.body?.description,
          day_mode:
            request.body?.dayMode === undefined
              ? undefined
              : request.body.dayMode === 'calendar'
                ? 'DAY_MODE_CALENDAR'
                : 'DAY_MODE_WORKING',
        },
        actorMetadata(current.user_id),
      );
      return reply.send(mapDiagram(response.diagram));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.delete('/api/v1/diagrams/:diagramId', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      await call(
        projectClient,
        'DeleteDiagram',
        { diagram_id: request.params.diagramId },
        actorMetadata(current.user_id),
      );
      return reply.code(204).send();
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });
  app.post('/api/v1/diagrams/:diagramId/directions', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'CreateDirection',
        {
          diagram_id: request.params.diagramId,
          name: request.body?.name,
          description: request.body?.description,
          result: request.body?.result,
          priority: priorityEnum(request.body?.priority),
          start_date: timestampInput(request.body?.startDate),
          end_date: timestampInput(request.body?.endDate),
          jira_number: request.body?.jiraNumber,
          bp_flag: Boolean(request.body?.bpFlag),
          sp_flag: Boolean(request.body?.spFlag),
        },
        actorMetadata(current.user_id),
      );
      return reply.code(201).send(mapDirection(response.direction));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/diagrams/:diagramId/tasks', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'CreateTask',
        {
          diagram_id: request.params.diagramId,
          direction_id: request.body?.directionId,
          parent_task_id: request.body?.parentTaskId,
          name: request.body?.name,
          description: request.body?.description,
          result: request.body?.result,
          priority: priorityEnum(request.body?.priority),
          start_date: timestampInput(request.body?.startDate),
          end_date: timestampInput(request.body?.endDate),
          jira_number: request.body?.jiraNumber,
          bp_flag: Boolean(request.body?.bpFlag),
          sp_flag: Boolean(request.body?.spFlag),
        },
        actorMetadata(current.user_id),
      );
      return reply.code(201).send(mapTask(response.task));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.get('/api/v1/diagrams/:diagramId/snapshot', async (request, reply) => {
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'GetDiagramSnapshot',
        { diagram_id: request.params.diagramId },
        actorMetadata(current.user_id),
      );
      return reply.send(mapSnapshot(response.snapshot));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });
  app.patch('/api/v1/tasks/:taskId/progress', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const status = String(request.body?.status ?? 'planned');
      const response = await call(
        projectClient,
        'UpdateTaskProgress',
        {
          task_id: request.params.taskId,
          status:
            {
              in_progress: 'TASK_STATUS_IN_PROGRESS',
              done: 'TASK_STATUS_DONE',
              blocked: 'TASK_STATUS_BLOCKED',
            }[status] ?? 'TASK_STATUS_PLANNED',
          progress: Number(request.body?.progress ?? 0),
        },
        actorMetadata(current.user_id),
      );
      return reply.send(mapTask(response.task));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.delete('/api/v1/tasks/:taskId', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      await call(
        projectClient,
        'DeleteTask',
        { task_id: request.params.taskId },
        actorMetadata(current.user_id),
      );
      return reply.code(204).send();
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.get('/api/v1/diagrams/:diagramId/dependencies', async (request, reply) => {
    try {
      const current = await session(request, userClient);
      const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 200);
      const offset = Math.max(Number(request.query.offset ?? 0), 0);
      const response = await call(
        projectClient,
        'ListDependencies',
        {
          diagram_id: request.params.diagramId,
          page: { limit, offset },
        },
        actorMetadata(current.user_id),
      );
      return reply.send({
        items: response.items.map(mapDependency),
        page: response.page,
      });
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.post('/api/v1/diagrams/:diagramId/dependencies', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      const response = await call(
        projectClient,
        'CreateDependency',
        {
          diagram_id: request.params.diagramId,
          predecessor_type: request.body?.predecessorType,
          predecessor_id: request.body?.predecessorId,
          successor_type: request.body?.successorType,
          successor_id: request.body?.successorId,
          color: request.body?.color,
          line_style: dependencyLineStyleEnum(request.body?.lineStyle),
          arrow_shape: dependencyArrowEnum(request.body?.arrowShape),
        },
        actorMetadata(current.user_id),
      );
      return reply.code(201).send(mapDependency(response.dependency));
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });

  app.delete('/api/v1/dependencies/:dependencyId', async (request, reply) => {
    if (requireCsrf(request, reply)) return reply;
    try {
      const current = await session(request, userClient);
      await call(
        projectClient,
        'DeleteDependency',
        { dependency_id: request.params.dependencyId },
        actorMetadata(current.user_id),
      );
      return reply.code(204).send();
    } catch (error) {
      return sendProblem(reply, request, error);
    }
  });
}
