-- Up Migration

CREATE SCHEMA IF NOT EXISTS notify;
CREATE SCHEMA IF NOT EXISTS delivery;
CREATE SCHEMA IF NOT EXISTS scheduler;
CREATE SCHEMA IF NOT EXISTS bots;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ext;

CREATE TABLE IF NOT EXISTS notify.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type varchar(64) NOT NULL,
  channel varchar(16) NOT NULL CHECK (channel IN ('internal', 'email', 'telegram')),
  enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone varchar(64) NOT NULL DEFAULT 'Europe/Moscow',
  digest_frequency varchar(16) NOT NULL DEFAULT 'immediate' CHECK (digest_frequency IN ('immediate', 'daily', 'weekly')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type, channel)
);

CREATE INDEX IF NOT EXISTS ix_notification_preferences_user ON notify.notification_preferences (user_id);
CREATE INDEX IF NOT EXISTS ix_notification_preferences_event ON notify.notification_preferences (event_type);

CREATE TABLE IF NOT EXISTS notify.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  project_id uuid,
  diagram_id uuid,
  event_type varchar(64) NOT NULL,
  title varchar(200) NOT NULL,
  body text NOT NULL,
  entity_type varchar(16) CHECK (entity_type IS NULL OR entity_type IN ('direction', 'task', 'comment', 'project')),
  entity_id uuid,
  payload jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_notifications_recipient_created ON notify.notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notifications_recipient_unread ON notify.notifications (recipient_user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS ix_notifications_project ON notify.notifications (project_id);
CREATE INDEX IF NOT EXISTS ix_notifications_diagram ON notify.notifications (diagram_id);
CREATE INDEX IF NOT EXISTS ix_notifications_entity ON notify.notifications (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS delivery.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notify.notifications(id) ON DELETE CASCADE,
  channel varchar(16) NOT NULL CHECK (channel IN ('internal', 'email', 'telegram')),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'retrying', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id varchar(200),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel)
);

CREATE INDEX IF NOT EXISTS ix_deliveries_status_next ON delivery.notification_deliveries (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS ix_deliveries_notification ON delivery.notification_deliveries (notification_id);

CREATE TABLE IF NOT EXISTS delivery.notification_delivery_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id uuid NOT NULL REFERENCES delivery.notification_deliveries(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('started', 'sent', 'failed')),
  provider_message_id varchar(200),
  error_code varchar(64),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (delivery_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS ix_delivery_attempts_delivery ON delivery.notification_delivery_attempts (delivery_id);

CREATE TABLE IF NOT EXISTS delivery.auth_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE,
  user_id uuid,
  invitation_id uuid,
  recipient_email varchar(320) NOT NULL,
  template_code varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  provider_message_id varchar(200),
  error_code varchar(64),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_auth_email_deliveries_status ON delivery.auth_email_deliveries (status, created_at);
CREATE INDEX IF NOT EXISTS ix_auth_email_deliveries_job ON delivery.auth_email_deliveries (job_id);

CREATE TABLE IF NOT EXISTS scheduler.reminder_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  diagram_id uuid NOT NULL,
  entity_type varchar(16) NOT NULL CHECK (entity_type IN ('direction', 'task')),
  entity_id uuid NOT NULL,
  kind varchar(16) NOT NULL CHECK (kind IN ('due_soon', 'overdue')),
  remind_at timestamptz NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  dedupe_key varchar(160) NOT NULL UNIQUE,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_reminder_jobs_next ON scheduler.reminder_jobs (remind_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_reminder_jobs_user ON scheduler.reminder_jobs (user_id);
CREATE INDEX IF NOT EXISTS ix_reminder_jobs_project ON scheduler.reminder_jobs (project_id);

CREATE TABLE IF NOT EXISTS bots.telegram_updates (
  update_id bigint PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now(),
  status varchar(16) NOT NULL CHECK (status IN ('processed', 'ignored', 'failed')),
  error text
);

CREATE INDEX IF NOT EXISTS ix_telegram_updates_processed ON bots.telegram_updates (processed_at);

CREATE TABLE IF NOT EXISTS events.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type varchar(64) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar(100) NOT NULL,
  payload jsonb NOT NULL,
  headers jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX IF NOT EXISTS ix_notification_outbox_unpublished ON events.outbox_events (published_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_notification_outbox_aggregate ON events.outbox_events (aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS events.processed_events (
  consumer varchar(64) NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

CREATE TABLE IF NOT EXISTS events.idempotency_keys (
  key varchar(128) PRIMARY KEY,
  user_id uuid,
  request_hash char(64) NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Down Migration

DROP TABLE IF EXISTS events.idempotency_keys;
DROP TABLE IF EXISTS events.processed_events;
DROP TABLE IF EXISTS events.outbox_events;
DROP TABLE IF EXISTS bots.telegram_updates;
DROP TABLE IF EXISTS scheduler.reminder_jobs;
DROP TABLE IF EXISTS delivery.auth_email_deliveries;
DROP TABLE IF EXISTS delivery.notification_delivery_attempts;
DROP TABLE IF EXISTS delivery.notification_deliveries;
DROP TABLE IF EXISTS notify.notifications;
DROP TABLE IF EXISTS notify.notification_preferences;
