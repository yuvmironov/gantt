import { randomUUID } from 'node:crypto';
import { status } from '@grpc/grpc-js';
import { call } from './user-client.js';

function grpcError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function toTimestamp(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  const milliseconds = date.getTime();
  if (Number.isNaN(milliseconds)) return undefined;
  return {
    seconds: String(Math.floor(milliseconds / 1000)),
    nanos: (milliseconds % 1000) * 1_000_000,
  };
}

function toProjectStatus(value) {
  return (
    {
      active: 'PROJECT_STATUS_ACTIVE',
      archived: 'PROJECT_STATUS_ARCHIVED',
      deleted: 'PROJECT_STATUS_DELETED',
    }[value] ?? 'PROJECT_STATUS_UNSPECIFIED'
  );
}

function toProject(row, myRole) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    owner_user_id: row.owner_user_id,
    status: toProjectStatus(row.status),
    settings: row.settings ?? {},
    my_role: myRole ?? 'PROJECT_ROLE_UNSPECIFIED',
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id ?? '',
    created_at: toTimestamp(row.created_at),
    updated_at: toTimestamp(row.updated_at),
    archived_at: toTimestamp(row.archived_at),
    deleted_at: toTimestamp(row.deleted_at),
    purge_after: toTimestamp(row.purge_after),
    names_resolved: false,
  };
}

function toDayMode(value) {
  return value === 'calendar' ? 'DAY_MODE_CALENDAR' : 'DAY_MODE_WORKING';
}

function toDiagram(row) {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    description: row.description ?? '',
    day_mode: toDayMode(row.day_mode),
    current_revision: String(row.current_revision ?? 0),
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id ?? '',
    created_at: toTimestamp(row.created_at),
    updated_at: toTimestamp(row.updated_at),
    archived_at: toTimestamp(row.archived_at),
    deleted_at: toTimestamp(row.deleted_at),
  };
}

function mapDbError(error) {
  return error;
}

function actorUserId(call_) {
  return call_.metadata.get('x-actor-user-id')[0] ?? '';
}

async function checkPermission(call_, userClient, projectId, permission) {
  const actor = actorUserId(call_);
  if (!actor) {
    throw grpcError(status.INVALID_ARGUMENT, 'actor_user_id_required');
  }

  const access = await call(userClient, 'CheckProjectPermission', {
    user_id: actor,
    project_id: projectId,
    permission,
  });
  if (!access.allowed) {
    throw grpcError(status.PERMISSION_DENIED, 'permission_denied');
  }
  return access.role;
}

export function createProjectImplementation({ db, userClient }) {
  return {
    async CreateProject(call_, callback) {
      const name = String(call_.request.name ?? '').trim();
      const description = String(call_.request.description ?? '');
      const ownerUserId = String(call_.request.owner_user_id ?? '');
      if (!name || name.length > 200) {
        callback(grpcError(status.INVALID_ARGUMENT, 'invalid_project_name'));
        return;
      }
      if (!ownerUserId) {
        callback(grpcError(status.INVALID_ARGUMENT, 'owner_user_id_required'));
        return;
      }

      const projectId = randomUUID();
      const settings = call_.request.settings ?? {};
      let client;
      try {
        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(
          `INSERT INTO project.projects
             (id, name, description, owner_user_id, status, settings, created_by_user_id, updated_by_user_id)
           VALUES ($1, $2, $3, $4, 'active', $5, $4, $4)
           RETURNING *`,
          [projectId, name, description, ownerUserId, settings],
        );
        await client.query('COMMIT');

        try {
          await call(userClient, 'EnsureProjectOwner', {
            project_id: projectId,
            owner_user_id: ownerUserId,
          });
        } catch (error) {
          await db.query('DELETE FROM project.projects WHERE id = $1', [projectId]).catch(() => {});
          callback(error);
          return;
        }

        callback(null, {
          project: toProject(result.rows[0], 'PROJECT_ROLE_OWNER'),
        });
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        callback(mapDbError(error));
      } finally {
        client?.release();
      }
    },

    async ListProjects(call_, callback) {
      const userId = String(call_.request.user_id ?? '');
      if (!userId) {
        callback(grpcError(status.INVALID_ARGUMENT, 'user_id_required'));
        return;
      }

      const limit = Math.min(Math.max(Number(call_.request.page?.limit ?? 50), 1), 200);
      const offset = Math.max(Number(call_.request.page?.offset ?? 0), 0);

      try {
        const accessible = await call(userClient, 'ListAccessibleProjectIds', {
          user_id: userId,
        });
        const ids = accessible.items.map((item) => item.project_id);
        const roles = new Map(accessible.items.map((item) => [item.project_id, item.role]));

        if (ids.length === 0) {
          callback(null, {
            items: [],
            page: { total: 0, limit, offset },
          });
          return;
        }

        const result = await db.query(
          `SELECT *
           FROM project.projects
           WHERE id = ANY($1::uuid[]) AND status = 'active'
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [ids, limit, offset],
        );
        const count = await db.query(
          `SELECT count(*)::int AS total
           FROM project.projects
           WHERE id = ANY($1::uuid[]) AND status = 'active'`,
          [ids],
        );

        callback(null, {
          items: result.rows.map((row) =>
            toProject(row, roles.get(row.id) ?? 'PROJECT_ROLE_UNSPECIFIED'),
          ),
          page: {
            total: count.rows[0].total,
            limit,
            offset,
          },
        });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async GetProject(call_, callback) {
      const projectId = String(call_.request.project_id ?? '');
      try {
        const role = await checkPermission(call_, userClient, projectId, 'project.view');
        const result = await db.query('SELECT * FROM project.projects WHERE id = $1', [projectId]);
        if (result.rowCount === 0) {
          callback(grpcError(status.NOT_FOUND, 'project_not_found'));
          return;
        }
        callback(null, { project: toProject(result.rows[0], role) });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async UpdateProject(call_, callback) {
      const projectId = String(call_.request.project_id ?? '');
      try {
        const role = await checkPermission(call_, userClient, projectId, 'project.update');
        const current = await db.query('SELECT * FROM project.projects WHERE id = $1', [projectId]);
        if (current.rowCount === 0) {
          callback(grpcError(status.NOT_FOUND, 'project_not_found'));
          return;
        }
        if (current.rows[0].status !== 'active') {
          callback(grpcError(status.FAILED_PRECONDITION, 'project_not_active'));
          return;
        }

        const result = await db.query(
          `UPDATE project.projects
           SET name = COALESCE($2, name),
               description = COALESCE($3, description),
               settings = COALESCE($4, settings),
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            projectId,
            call_.request.name ?? null,
            call_.request.description ?? null,
            call_.request.settings ?? null,
          ],
        );
        callback(null, { project: toProject(result.rows[0], role) });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async ArchiveProject(call_, callback) {
      const projectId = String(call_.request.project_id ?? '');
      try {
        const role = await checkPermission(call_, userClient, projectId, 'project.archive');
        const result = await db.query(
          `UPDATE project.projects
           SET status = 'archived', archived_at = now(), updated_at = now()
           WHERE id = $1 AND status = 'active'
           RETURNING *`,
          [projectId],
        );
        if (result.rowCount === 0) {
          callback(grpcError(status.FAILED_PRECONDITION, 'project_not_active'));
          return;
        }
        callback(null, { project: toProject(result.rows[0], role) });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async UnarchiveProject(call_, callback) {
      const projectId = String(call_.request.project_id ?? '');
      try {
        const role = await checkPermission(call_, userClient, projectId, 'project.restore');
        const result = await db.query(
          `UPDATE project.projects
           SET status = 'active', archived_at = NULL, updated_at = now()
           WHERE id = $1 AND status = 'archived'
           RETURNING *`,
          [projectId],
        );
        if (result.rowCount === 0) {
          callback(grpcError(status.FAILED_PRECONDITION, 'project_not_archived'));
          return;
        }
        callback(null, { project: toProject(result.rows[0], role) });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async DeleteProject(call_, callback) {
      const projectId = String(call_.request.project_id ?? '');
      try {
        const role = await checkPermission(call_, userClient, projectId, 'project.delete');
        const result = await db.query(
          `UPDATE project.projects
           SET status = 'deleted',
               deleted_at = now(),
               purge_after = now() + interval '1 year',
               updated_at = now()
           WHERE id = $1 AND status = 'archived'
           RETURNING *`,
          [projectId],
        );
        if (result.rowCount === 0) {
          callback(grpcError(status.FAILED_PRECONDITION, 'project_not_archived'));
          return;
        }
        callback(null, { project: toProject(result.rows[0], role) });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async RestoreProject(call_, callback) {
      const projectId = String(call_.request.project_id ?? '');
      try {
        const role = await checkPermission(call_, userClient, projectId, 'project.restore');
        const result = await db.query(
          `UPDATE project.projects
           SET status = 'archived',
               deleted_at = NULL,
               purge_after = NULL,
               archived_at = now(),
               updated_at = now()
           WHERE id = $1 AND status = 'deleted'
           RETURNING *`,
          [projectId],
        );
        if (result.rowCount === 0) {
          callback(grpcError(status.FAILED_PRECONDITION, 'project_not_deleted'));
          return;
        }
        callback(null, { project: toProject(result.rows[0], role) });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async CreateDiagram(call_, callback) {
      const projectId = String(call_.request.project_id ?? '');
      const name = String(call_.request.name ?? '').trim();
      const description = String(call_.request.description ?? '');
      const dayMode = toDayMode(
        call_.request.day_mode === 'DAY_MODE_CALENDAR' ? 'calendar' : 'working',
      );
      if (!projectId || !name || name.length > 200) {
        callback(grpcError(status.INVALID_ARGUMENT, 'invalid_diagram_name'));
        return;
      }

      try {
        await checkPermission(call_, userClient, projectId, 'diagram.create');
        const result = await db.query(
          `INSERT INTO project.diagrams
             (project_id, name, description, day_mode, created_by_user_id, updated_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $5)
           RETURNING *`,
          [
            projectId,
            name,
            description,
            dayMode === 'DAY_MODE_CALENDAR' ? 'calendar' : 'working',
            actorUserId(call_),
          ],
        );
        callback(null, { diagram: toDiagram(result.rows[0]) });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async ListDiagrams(call_, callback) {
      const projectId = String(call_.request.project_id ?? '');
      const limit = Math.min(Math.max(Number(call_.request.page?.limit ?? 50), 1), 200);
      const offset = Math.max(Number(call_.request.page?.offset ?? 0), 0);

      try {
        await checkPermission(call_, userClient, projectId, 'project.view');
        const result = await db.query(
          `SELECT *
           FROM project.diagrams
           WHERE project_id = $1 AND deleted_at IS NULL
           ORDER BY created_at ASC
           LIMIT $2 OFFSET $3`,
          [projectId, limit, offset],
        );
        const count = await db.query(
          `SELECT count(*)::int AS total
           FROM project.diagrams
           WHERE project_id = $1 AND deleted_at IS NULL`,
          [projectId],
        );
        callback(null, {
          items: result.rows.map(toDiagram),
          page: {
            total: count.rows[0].total,
            limit,
            offset,
          },
        });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async GetDiagram(call_, callback) {
      const diagramId = String(call_.request.diagram_id ?? '');
      try {
        const result = await db.query(
          `SELECT * FROM project.diagrams
           WHERE id = $1 AND deleted_at IS NULL`,
          [diagramId],
        );
        if (result.rowCount === 0) {
          callback(grpcError(status.NOT_FOUND, 'diagram_not_found'));
          return;
        }
        const diagram = result.rows[0];
        await checkPermission(call_, userClient, diagram.project_id, 'project.view');
        callback(null, {
          diagram: toDiagram(diagram),
          project_id: diagram.project_id,
          current_revision: String(diagram.current_revision ?? 0),
          names_resolved: false,
        });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async UpdateDiagram(call_, callback) {
      const diagramId = String(call_.request.diagram_id ?? '');
      try {
        const current = await db.query(
          `SELECT * FROM project.diagrams
           WHERE id = $1 AND deleted_at IS NULL`,
          [diagramId],
        );
        if (current.rowCount === 0) {
          callback(grpcError(status.NOT_FOUND, 'diagram_not_found'));
          return;
        }
        const row = current.rows[0];
        await checkPermission(call_, userClient, row.project_id, 'diagram.update');
        const dayMode = call_.request.day_mode
          ? call_.request.day_mode === 'DAY_MODE_CALENDAR'
            ? 'calendar'
            : 'working'
          : row.day_mode;
        const result = await db.query(
          `UPDATE project.diagrams
           SET name = COALESCE($2, name),
               description = COALESCE($3, description),
               day_mode = $4,
               updated_by_user_id = $5,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            diagramId,
            call_.request.name ?? null,
            call_.request.description ?? null,
            dayMode,
            actorUserId(call_),
          ],
        );
        callback(null, { diagram: toDiagram(result.rows[0]) });
      } catch (error) {
        callback(mapDbError(error));
      }
    },

    async DeleteDiagram(call_, callback) {
      const diagramId = String(call_.request.diagram_id ?? '');
      try {
        const current = await db.query(
          `SELECT * FROM project.diagrams
           WHERE id = $1 AND deleted_at IS NULL`,
          [diagramId],
        );
        if (current.rowCount === 0) {
          callback(grpcError(status.NOT_FOUND, 'diagram_not_found'));
          return;
        }
        await checkPermission(call_, userClient, current.rows[0].project_id, 'diagram.delete');
        await db.query(
          `UPDATE project.diagrams
           SET deleted_at = now(), updated_by_user_id = $2, updated_at = now()
           WHERE id = $1`,
          [diagramId, actorUserId(call_)],
        );
        callback(null, { deleted: true });
      } catch (error) {
        callback(mapDbError(error));
      }
    },
  };
}
