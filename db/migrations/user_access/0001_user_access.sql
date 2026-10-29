-- Up Migration

CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS access;
CREATE SCHEMA IF NOT EXISTS jobs;
CREATE SCHEMA IF NOT EXISTS settings;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ext;

CREATE TABLE IF NOT EXISTS access.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  email_verified_at timestamptz,
  display_name varchar(200) NOT NULL,
  last_name varchar(100),
  first_name varchar(100),
  middle_name varchar(100),
  position varchar(200),
  timezone varchar(64) NOT NULL DEFAULT 'Europe/Moscow',
  locale varchar(16) NOT NULL DEFAULT 'ru-RU',
  failed_login_attempts smallint NOT NULL DEFAULT 0,
  lockout_level smallint NOT NULL DEFAULT 0 CHECK (lockout_level BETWEEN 0 AND 3),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_users_status ON access.users (status);
CREATE INDEX IF NOT EXISTS ix_users_display_name ON access.users (display_name);

CREATE TABLE IF NOT EXISTS access.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES access.users(id) ON DELETE CASCADE,
  session_token_hash char(64) NOT NULL UNIQUE,
  absolute_expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  remember_token_hash char(64) UNIQUE,
  remember_absolute_expires_at timestamptz,
  remember_idle_expires_at timestamptz,
  user_agent text,
  ip inet,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_user_sessions_user_absolute ON access.user_sessions (user_id, absolute_expires_at);
CREATE INDEX IF NOT EXISTS ix_user_sessions_idle ON access.user_sessions (idle_expires_at);
CREATE INDEX IF NOT EXISTS ix_user_sessions_revoked ON access.user_sessions (revoked_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sessions_remember ON access.user_sessions (remember_token_hash) WHERE remember_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION access.enforce_max_sessions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT count(*)
    FROM access.user_sessions
    WHERE user_id = NEW.user_id
      AND revoked_at IS NULL
      AND (absolute_expires_at > now() OR remember_absolute_expires_at > now())
  ) >= 2 THEN
    RAISE EXCEPTION 'session_limit_reached';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_sessions_max ON access.user_sessions;
CREATE TRIGGER trg_user_sessions_max
BEFORE INSERT ON access.user_sessions
FOR EACH ROW EXECUTE FUNCTION access.enforce_max_sessions();

CREATE TABLE IF NOT EXISTS access.roles (
  code varchar(32) PRIMARY KEY,
  scope varchar(16) NOT NULL CHECK (scope IN ('app', 'project')),
  name varchar(100) NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS access.permissions (
  code varchar(64) PRIMARY KEY,
  scope varchar(16) NOT NULL CHECK (scope IN ('app', 'project')),
  description text
);

CREATE TABLE IF NOT EXISTS access.role_permissions (
  role_code varchar(32) NOT NULL REFERENCES access.roles(code) ON DELETE CASCADE,
  permission_code varchar(64) NOT NULL REFERENCES access.permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE IF NOT EXISTS access.user_roles (
  user_id uuid NOT NULL REFERENCES access.users(id) ON DELETE CASCADE,
  role_code varchar(32) NOT NULL REFERENCES access.roles(code),
  granted_by_user_id uuid REFERENCES access.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_code)
);

CREATE TABLE IF NOT EXISTS access.project_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES access.users(id) ON DELETE CASCADE,
  role_code varchar(32) NOT NULL REFERENCES access.roles(code),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'revoked')),
  invited_by_user_id uuid REFERENCES access.users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  joined_at timestamptz,
  revoked_at timestamptz,
  revoked_reason varchar(32) CHECK (revoked_reason IN ('project_deleted', 'member_removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_project_memberships_user ON access.project_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS ix_project_memberships_project ON access.project_memberships (project_id);
CREATE INDEX IF NOT EXISTS ix_project_memberships_role ON access.project_memberships (role_code);
CREATE INDEX IF NOT EXISTS ix_project_memberships_revoked_reason ON access.project_memberships (revoked_reason);

CREATE TABLE IF NOT EXISTS access.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  email citext NOT NULL,
  role_code varchar(32) NOT NULL REFERENCES access.roles(code),
  invited_by_user_id uuid REFERENCES access.users(id) ON DELETE SET NULL,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_invitations_project ON access.invitations (project_id);
CREATE INDEX IF NOT EXISTS ix_invitations_email ON access.invitations (email);
CREATE INDEX IF NOT EXISTS ix_invitations_expires ON access.invitations (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invitations_active_email ON access.invitations (project_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS access.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES access.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_password_reset_user ON access.password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS ix_password_reset_expires ON access.password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS access.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES access.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_email_verification_user ON access.email_verification_tokens (user_id);
CREATE INDEX IF NOT EXISTS ix_email_verification_expires ON access.email_verification_tokens (expires_at);

CREATE TABLE IF NOT EXISTS access.executors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_name varchar(100) NOT NULL,
  first_name varchar(100) NOT NULL,
  middle_name varchar(100),
  full_name citext NOT NULL UNIQUE,
  position varchar(200),
  linked_user_id uuid UNIQUE REFERENCES access.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (length(trim(full_name)) > 0)
);

CREATE INDEX IF NOT EXISTS ix_executors_active ON access.executors (is_active);
CREATE INDEX IF NOT EXISTS ix_executors_linked_user ON access.executors (linked_user_id);

CREATE TABLE IF NOT EXISTS access.telegram_links (
  user_id uuid PRIMARY KEY REFERENCES access.users(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL UNIQUE,
  telegram_username varchar(64),
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS settings.system_settings (
  key varchar(100) PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by_user_id uuid REFERENCES access.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs.auth_email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES access.users(id) ON DELETE CASCADE,
  invitation_id uuid REFERENCES access.invitations(id) ON DELETE CASCADE,
  recipient_email citext NOT NULL,
  template_code varchar(64) NOT NULL,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_auth_email_jobs_next ON jobs.auth_email_jobs (next_attempt_at) WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS ix_auth_email_jobs_user ON jobs.auth_email_jobs (user_id);
CREATE INDEX IF NOT EXISTS ix_auth_email_jobs_invitation ON jobs.auth_email_jobs (invitation_id);

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

CREATE INDEX IF NOT EXISTS ix_user_outbox_unpublished ON events.outbox_events (published_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_user_outbox_aggregate ON events.outbox_events (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS ix_user_outbox_occurred ON events.outbox_events (occurred_at);

CREATE TABLE IF NOT EXISTS events.processed_events (
  consumer varchar(64) NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

CREATE TABLE IF NOT EXISTS events.idempotency_keys (
  key varchar(128) PRIMARY KEY,
  user_id uuid REFERENCES access.users(id) ON DELETE SET NULL,
  request_hash char(64) NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Down Migration

DROP TABLE IF EXISTS events.idempotency_keys;
DROP TABLE IF EXISTS events.processed_events;
DROP TABLE IF EXISTS events.outbox_events;
DROP TABLE IF EXISTS jobs.auth_email_jobs;
DROP TABLE IF EXISTS settings.system_settings;
DROP TABLE IF EXISTS access.telegram_links;
DROP TABLE IF EXISTS access.executors;
DROP TABLE IF EXISTS access.email_verification_tokens;
DROP TABLE IF EXISTS access.password_reset_tokens;
DROP TABLE IF EXISTS access.invitations;
DROP TABLE IF EXISTS access.project_memberships;
DROP TABLE IF EXISTS access.user_roles;
DROP TABLE IF EXISTS access.role_permissions;
DROP TABLE IF EXISTS access.permissions;
DROP TABLE IF EXISTS access.roles;
DROP TRIGGER IF EXISTS trg_user_sessions_max ON access.user_sessions;
DROP FUNCTION IF EXISTS access.enforce_max_sessions();
DROP TABLE IF EXISTS access.user_sessions;
DROP TABLE IF EXISTS access.users;
