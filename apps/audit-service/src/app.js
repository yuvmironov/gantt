import rateLimit from '@fastify/rate-limit';
import { createService, loadConfig } from '@smart-oati/service-kit';

const serviceName = 'audit-service';
const serviceVersion = '0.1.0';

function toEvent(row) {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actorUserId: row.actor_user_id,
    actorType: row.actor_type,
    actorRoles: row.actor_roles ?? [],
    actionCode: row.action_code,
    entityType: row.entity_type,
    entityId: row.entity_id,
    projectId: row.project_id,
    diagramId: row.diagram_id,
    requestId: row.request_id,
    correlationId: row.correlation_id,
    ip: row.ip,
    userAgent: row.user_agent,
    beforeData: row.before_data ?? {},
    afterData: row.after_data ?? {},
    metadata: row.metadata ?? {},
    severity: row.severity,
    createdAt: row.created_at,
  };
}

export function buildApp({ env = process.env, logger = true, db }) {
  const config = loadConfig(env, {
    logLevel: env.LOG_LEVEL ?? 'info',
    port: 8080,
  });

  return createService({
    name: serviceName,
    version: serviceVersion,
    config,
    logger,
    routes: async (app) => {
      await app.register(rateLimit, { global: true, max: 200, timeWindow: '1 minute' });

      app.get('/internal/audit/events', async (request) => {
        const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 200);
        const offset = Math.max(Number(request.query.offset ?? 0), 0);
        const actionCode = String(request.query.actionCode ?? '');
        const projectId = String(request.query.projectId ?? '');
        const actorUserId = String(request.query.actorUserId ?? '');
        const result = await db.query(
          `SELECT * FROM audit.audit_events
           WHERE ($1 = '' OR action_code = $1)
             AND ($2 = '' OR project_id = NULLIF($2, '')::uuid)
             AND ($3 = '' OR actor_user_id = NULLIF($3, '')::uuid)
           ORDER BY occurred_at DESC
           LIMIT $4 OFFSET $5`,
          [actionCode, projectId, actorUserId, limit, offset],
        );
        const count = await db.query(
          `SELECT count(*)::int AS total FROM audit.audit_events
           WHERE ($1 = '' OR action_code = $1)
             AND ($2 = '' OR project_id = NULLIF($2, '')::uuid)
             AND ($3 = '' OR actor_user_id = NULLIF($3, '')::uuid)`,
          [actionCode, projectId, actorUserId],
        );
        return {
          items: result.rows.map(toEvent),
          page: { total: count.rows[0].total, limit, offset },
        };
      });

      app.get('/internal/audit/privileged-events', async (request) => {
        const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 200);
        const offset = Math.max(Number(request.query.offset ?? 0), 0);
        const result = await db.query(
          `SELECT * FROM audit.privileged_audit_events
           ORDER BY occurred_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset],
        );
        const count = await db.query(
          `SELECT count(*)::int AS total FROM audit.privileged_audit_events`,
        );
        return {
          items: result.rows.map(toEvent),
          page: { total: count.rows[0].total, limit, offset },
        };
      });

      app.get('/internal/audit/actions', async () => ({
        items: (
          await db.query(
            `SELECT code, category, description, severity
             FROM audit.audit_actions ORDER BY category, code`,
          )
        ).rows,
      }));

      app.get('/internal/audit/stats', async () => {
        const result = await db.query(
          `SELECT severity, count(*)::int AS total
           FROM audit.audit_events GROUP BY severity`,
        );
        return {
          total: result.rows.reduce((sum, row) => sum + row.total, 0),
          bySeverity: Object.fromEntries(result.rows.map((row) => [row.severity, row.total])),
        };
      });
    },
  });
}
