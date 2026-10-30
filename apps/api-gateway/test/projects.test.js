import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const apps = [];

function build(userClient, projectClient) {
  const app = buildApp({
    env: {
      PORT: '8080',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      USER_SERVICE_GRPC: '127.0.0.1:50051',
      PROJECT_SERVICE_GRPC: '127.0.0.1:50051',
    },
    logger: false,
    userClient,
    projectClient,
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const sessionUser = {
  ValidateSession(_request, callback) {
    callback(null, { user_id: 'user-1', session_id: 'session-1' });
  },
};

const project = {
  id: 'project-1',
  name: 'РџСЂРѕРµРєС‚',
  description: '',
  owner_user_id: 'user-1',
  status: 'PROJECT_STATUS_ACTIVE',
  settings: {},
  my_role: 'PROJECT_ROLE_OWNER',
  created_by_user_id: 'user-1',
  updated_by_user_id: 'user-1',
  created_at: { seconds: '1793290000', nanos: 0 },
  updated_at: { seconds: '1793290000', nanos: 0 },
};

describe('api-gateway project routes', () => {
  it('lists accessible projects', async () => {
    const app = build(sessionUser, {
      ListProjects(_request, callback) {
        callback(null, {
          items: [project],
          page: { total: 1, limit: 50, offset: 0 },
        });
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      cookies: { '__Host-session': 'token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ id: 'project-1', status: 'active', myRole: 'project_owner' }],
      page: { total: 1 },
    });
  });

  it('loads project details with actor metadata', async () => {
    let metadata;
    const app = build(sessionUser, {
      GetProject(_request, requestMetadata, callback) {
        metadata = requestMetadata;
        callback(null, { project });
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/project-1',
      cookies: { '__Host-session': 'token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: 'project-1', status: 'active' });
    expect(metadata.get('x-actor-user-id')).toEqual(['user-1']);
  });

  it('creates and lists diagrams', async () => {
    const diagram = {
      id: 'diagram-1',
      project_id: 'project-1',
      name: 'План',
      description: '',
      day_mode: 'DAY_MODE_WORKING',
      current_revision: '0',
      created_by_user_id: 'user-1',
    };
    const app = build(sessionUser, {
      ListDiagrams(_request, _metadata, callback) {
        callback(null, {
          items: [diagram],
          page: { total: 1, limit: 50, offset: 0 },
        });
      },
      CreateDiagram(_request, _metadata, callback) {
        callback(null, { diagram });
      },
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/project-1/diagrams',
      cookies: { '__Host-session': 'token', '__Host-csrf': 'csrf' },
      headers: { 'x-csrf-token': 'csrf' },
      payload: { name: 'План' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ id: 'diagram-1', dayMode: 'working' });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/project-1/diagrams',
      cookies: { '__Host-session': 'token' },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({ items: [{ id: 'diagram-1' }] });
  });

  it('loads, updates and deletes a diagram', async () => {
    const diagram = {
      id: 'diagram-1',
      project_id: 'project-1',
      name: 'План',
      description: '',
      day_mode: 'DAY_MODE_WORKING',
      current_revision: '0',
      created_by_user_id: 'user-1',
    };
    const app = build(sessionUser, {
      GetDiagram(_request, _metadata, callback) {
        callback(null, { diagram, project_id: 'project-1' });
      },
      UpdateDiagram(_request, _metadata, callback) {
        callback(null, { diagram: { ...diagram, name: 'Новый план' } });
      },
      DeleteDiagram(_request, _metadata, callback) {
        callback(null, { deleted: true });
      },
    });

    const detail = await app.inject({
      method: 'GET',
      url: '/api/v1/diagrams/diagram-1',
      cookies: { '__Host-session': 'token' },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: 'diagram-1', projectId: 'project-1' });

    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/v1/diagrams/diagram-1',
      cookies: { '__Host-session': 'token', '__Host-csrf': 'csrf' },
      headers: { 'x-csrf-token': 'csrf' },
      payload: { name: 'Новый план' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Новый план' });

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/v1/diagrams/diagram-1',
      cookies: { '__Host-session': 'token', '__Host-csrf': 'csrf' },
      headers: { 'x-csrf-token': 'csrf' },
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('creates directions/tasks and returns a Gantt snapshot', async () => {
    const direction = {
      id: 'direction-1',
      diagram_id: 'diagram-1',
      wbs_code: '1',
      sort_order: 1,
      name: 'Направление',
      priority: 'PRIORITY_MEDIUM',
      version: 1,
      created_by_user_id: 'user-1',
    };
    const task = {
      id: 'task-1',
      diagram_id: 'diagram-1',
      direction_id: 'direction-1',
      level: 2,
      wbs_code: '1.1',
      sort_order: 1,
      name: 'Задача',
      status: 'TASK_STATUS_PLANNED',
      progress: 0,
      priority: 'PRIORITY_MEDIUM',
      version: 1,
      created_by_user_id: 'user-1',
    };
    const app = build(sessionUser, {
      CreateDirection(_request, _metadata, callback) {
        callback(null, { direction });
      },
      CreateTask(_request, _metadata, callback) {
        callback(null, { task });
      },
      GetDiagramSnapshot(_request, _metadata, callback) {
        callback(null, {
          snapshot: {
            diagram: {
              id: 'diagram-1',
              project_id: 'project-1',
              name: 'План',
              day_mode: 'DAY_MODE_WORKING',
              current_revision: '0',
            },
            directions: [direction],
            tasks: [task],
            dependencies: [],
            comments: [],
            holidays: [],
            current_revision: '0',
          },
        });
      },
    });
    const cookies = { '__Host-session': 'token', '__Host-csrf': 'csrf' };
    const headers = { 'x-csrf-token': 'csrf' };

    const createdDirection = await app.inject({
      method: 'POST',
      url: '/api/v1/diagrams/diagram-1/directions',
      cookies,
      headers,
      payload: { name: 'Направление' },
    });
    expect(createdDirection.statusCode).toBe(201);
    expect(createdDirection.json()).toMatchObject({ wbsCode: '1' });

    const createdTask = await app.inject({
      method: 'POST',
      url: '/api/v1/diagrams/diagram-1/tasks',
      cookies,
      headers,
      payload: { directionId: 'direction-1', name: 'Задача' },
    });
    expect(createdTask.statusCode).toBe(201);
    expect(createdTask.json()).toMatchObject({ status: 'planned', progress: 0 });

    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/v1/diagrams/diagram-1/snapshot',
      cookies,
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({
      directions: [{ id: 'direction-1' }],
      tasks: [{ id: 'task-1' }],
      currentRevision: 0,
    });
  });

  it('creates a project for the current user', async () => {
    let received;
    const app = build(sessionUser, {
      CreateProject(request, callback) {
        received = request;
        callback(null, { project });
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      cookies: {
        '__Host-session': 'token',
        '__Host-csrf': 'csrf',
      },
      headers: { 'x-csrf-token': 'csrf' },
      payload: { name: 'РџСЂРѕРµРєС‚', description: 'РћРїРёСЃР°РЅРёРµ' },
    });

    expect(response.statusCode).toBe(201);
    expect(received).toMatchObject({
      name: 'РџСЂРѕРµРєС‚',
      owner_user_id: 'user-1',
    });
    expect(response.json()).toMatchObject({
      id: 'project-1',
      status: 'active',
      myRole: 'project_owner',
    });
  });

  it('rejects project creation without CSRF', async () => {
    const app = build(sessionUser, {});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      cookies: { '__Host-session': 'token' },
      payload: { name: 'РџСЂРѕРµРєС‚' },
    });

    expect(response.statusCode).toBe(403);
  });
});
