import nodemailer from 'nodemailer';
import { enqueueDeliveries } from './events.js';
import { call } from './user-client.js';

const MAX_ATTEMPTS = 3;

export function startNotificationDeliveryWorker(db, userClient, env = process.env) {
  const smtpUrl = String(env.SMTP_URL ?? '').trim();
  const transporter = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
  const telegramApi = String(env.TELEGRAM_API_URL ?? 'http://telegram-mock:8080').replace(
    /\/$/,
    '',
  );
  const botToken = env.TELEGRAM_BOT_TOKEN ?? 'local-test-token';
  let stopped = false;
  let timer;

  async function contactsFor(userId) {
    const response = await call(userClient, 'GetNotificationContacts', { user_ids: [userId] });
    return response.items?.[0] ?? null;
  }

  async function process() {
    if (stopped) return;
    try {
      const missing = await db.query(
        `SELECT n.id, n.recipient_user_id, n.event_type
         FROM notify.notifications n
         WHERE NOT EXISTS (
           SELECT 1 FROM delivery.notification_deliveries d
           WHERE d.notification_id = n.id
         )
         AND n.created_at > now() - interval '1 day'
         ORDER BY n.created_at ASC LIMIT 20`,
      );
      for (const item of missing.rows) {
        await enqueueDeliveries(db, item.id, item.recipient_user_id, item.event_type);
      }
      const result = await db.query(
        `SELECT d.*, n.title, n.body, n.recipient_user_id
         FROM delivery.notification_deliveries d
         JOIN notify.notifications n ON n.id = d.notification_id
         WHERE d.status IN ('pending', 'retrying')
           AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
         ORDER BY d.created_at ASC
         LIMIT 20`,
      );
      for (const delivery of result.rows) {
        const attemptNo = Number(delivery.attempt_count) + 1;
        await db.query(
          `UPDATE delivery.notification_deliveries SET status = 'sending', updated_at = now()
           WHERE id = $1`,
          [delivery.id],
        );
        const attempt = await db.query(
          `INSERT INTO delivery.notification_delivery_attempts
             (delivery_id, attempt_no, status) VALUES ($1, $2, 'started') RETURNING id`,
          [delivery.id, attemptNo],
        );
        try {
          if (delivery.channel === 'internal') {
            await db.query(
              `UPDATE delivery.notification_deliveries
               SET status = 'sent', attempt_count = $2, sent_at = now(), updated_at = now()
               WHERE id = $1`,
              [delivery.id, attemptNo],
            );
            await db.query(
              `UPDATE delivery.notification_delivery_attempts
               SET status = 'sent', finished_at = now() WHERE id = $1`,
              [attempt.rows[0].id],
            );
            continue;
          }
          const contact = await contactsFor(delivery.recipient_user_id);
          if (!contact) throw new Error('notification_contact_not_found');
          if (delivery.channel === 'email') {
            if (!transporter) throw new Error('smtp_not_configured');
            if (!contact.email) throw new Error('email_not_found');
            const sent = await transporter.sendMail({
              from: env.SMTP_FROM ?? 'SMART OATI <no-reply@smart-oati.local>',
              to: contact.email,
              subject: delivery.title,
              text: delivery.body,
            });
            await db.query(
              `UPDATE delivery.notification_deliveries
               SET status = 'sent', attempt_count = $2, sent_at = now(),
                 provider_message_id = $3, last_error = NULL, updated_at = now()
               WHERE id = $1`,
              [delivery.id, attemptNo, sent.messageId ?? null],
            );
            await db.query(
              `UPDATE delivery.notification_delivery_attempts
               SET status = 'sent', finished_at = now(), provider_message_id = $2
               WHERE id = $1`,
              [attempt.rows[0].id, sent.messageId ?? null],
            );
            continue;
          }
          if (delivery.channel === 'telegram') {
            if (!contact.telegram_linked || !contact.telegram_user_id) {
              throw new Error('telegram_not_linked');
            }
            const response = await fetch(`${telegramApi}/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: contact.telegram_user_id,
                text: `${delivery.title}\n${delivery.body}`,
              }),
            });
            if (!response.ok) throw new Error(`telegram_http_${response.status}`);
            await db.query(
              `UPDATE delivery.notification_deliveries
               SET status = 'sent', attempt_count = $2, sent_at = now(),
                 last_error = NULL, updated_at = now()
               WHERE id = $1`,
              [delivery.id, attemptNo],
            );
            await db.query(
              `UPDATE delivery.notification_delivery_attempts
               SET status = 'sent', finished_at = now() WHERE id = $1`,
              [attempt.rows[0].id],
            );
            continue;
          }
          throw new Error(`unsupported_channel:${delivery.channel}`);
        } catch (error) {
          const failed = attemptNo >= MAX_ATTEMPTS;
          await db.query(
            `UPDATE delivery.notification_deliveries
             SET status = $2, attempt_count = $3, last_error = $4,
                 next_attempt_at = now() + ($5 * interval '1 second'), updated_at = now()
             WHERE id = $1`,
            [
              delivery.id,
              failed ? 'failed' : 'retrying',
              attemptNo,
              String(error.message ?? error).slice(0, 500),
              failed ? 3600 : Math.pow(2, attemptNo) * 5,
            ],
          );
          await db.query(
            `UPDATE delivery.notification_delivery_attempts
             SET status = 'failed', finished_at = now(), error_code = 'delivery_failed',
                 error_message = $2 WHERE id = $1`,
            [attempt.rows[0].id, String(error.message ?? error).slice(0, 500)],
          );
        }
      }
    } catch (error) {
      console.error('delivery worker failed', error);
    }
  }

  timer = setInterval(process, 2000);
  process();
  return async () => {
    stopped = true;
    clearInterval(timer);
  };
}
