import rateLimit from '@fastify/rate-limit';
import { createService, loadConfig } from '@smart-oati/service-kit';

const serviceName = 'notification-service';
const serviceVersion = '0.1.0';

function toNotification(row) {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    projectId: row.project_id,
    diagramId: row.diagram_id,
    eventType: row.event_type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload ?? {},
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function toPreference(row) {
  return {
    eventType: row.event_type,
    channel: row.channel,
    enabled: row.enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    timezone: row.timezone,
    digestFrequency: row.digest_frequency,
    updatedAt: row.updated_at,
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

      app.get('/internal/notifications', async (request) => {
        const userId = String(request.headers['x-user-id'] ?? '');
        const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 200);
        const offset = Math.max(Number(request.query.offset ?? 0), 0);
        const unreadOnly = request.query.unreadOnly === 'true';
        const eventType = String(request.query.eventType ?? '');
        const result = await db.query(
          `SELECT * FROM notify.notifications
           WHERE recipient_user_id = $1
             AND ($2::boolean = false OR is_read = false)
             AND ($3 = '' OR event_type = $3)
           ORDER BY created_at DESC
           LIMIT $4 OFFSET $5`,
          [userId, unreadOnly, eventType, limit, offset],
        );
        const count = await db.query(
          `SELECT count(*)::int AS total FROM notify.notifications
           WHERE recipient_user_id = $1
             AND ($2::boolean = false OR is_read = false)
             AND ($3 = '' OR event_type = $3)`,
          [userId, unreadOnly, eventType],
        );
        return {
          items: result.rows.map(toNotification),
          page: { total: count.rows[0].total, limit, offset },
        };
      });

      app.get('/internal/notifications/unread-count', async (request) => {
        const userId = String(request.headers['x-user-id'] ?? '');
        const result = await db.query(
          `SELECT count(*)::int AS count FROM notify.notifications
           WHERE recipient_user_id = $1 AND is_read = false`,
          [userId],
        );
        return { count: result.rows[0].count };
      });

      app.post('/internal/notifications/read', async (request) => {
        const userId = String(request.headers['x-user-id'] ?? '');
        const ids = request.body?.ids ?? [];
        if (ids.length === 0) return { updated: 0 };
        const result = await db.query(
          `UPDATE notify.notifications
           SET is_read = true, read_at = COALESCE(read_at, now())
           WHERE recipient_user_id = $1 AND id = ANY($2::uuid[]) AND is_read = false`,
          [userId, ids],
        );
        return { updated: result.rowCount };
      });

      app.post('/internal/notifications/read-all', async (request) => {
        const userId = String(request.headers['x-user-id'] ?? '');
        const result = await db.query(
          `UPDATE notify.notifications
           SET is_read = true, read_at = COALESCE(read_at, now())
           WHERE recipient_user_id = $1 AND is_read = false`,
          [userId],
        );
        return { updated: result.rowCount };
      });

      app.get('/internal/notifications/preferences', async (request) => {
        const userId = String(request.headers['x-user-id'] ?? '');
        const result = await db.query(
          `SELECT * FROM notify.notification_preferences
           WHERE user_id = $1 ORDER BY event_type, channel`,
          [userId],
        );
        return { items: result.rows.map(toPreference) };
      });

      app.put('/internal/notifications/preferences', async (request) => {
        const userId = String(request.headers['x-user-id'] ?? '');
        const items = request.body?.items ?? [];
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM notify.notification_preferences WHERE user_id = $1', [
            userId,
          ]);
          for (const item of items) {
            await client.query(
              `INSERT INTO notify.notification_preferences
                 (user_id, event_type, channel, enabled, quiet_hours_start,
                  quiet_hours_end, timezone, digest_frequency)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                userId,
                item.eventType,
                item.channel ?? 'internal',
                item.enabled !== false,
                item.quietHoursStart || null,
                item.quietHoursEnd || null,
                item.timezone ?? 'Europe/Moscow',
                item.digestFrequency ?? 'immediate',
              ],
            );
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        const result = await db.query(
          `SELECT * FROM notify.notification_preferences
           WHERE user_id = $1 ORDER BY event_type, channel`,
          [userId],
        );
        return { items: result.rows.map(toPreference) };
      });
    },
  });
}
