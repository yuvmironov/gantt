-- Up Migration

CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ext;

CREATE TABLE IF NOT EXISTS audit.audit_actions (
  code varchar(64) PRIMARY KEY,
  category varchar(32) NOT NULL,
  description varchar(200) NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical'))
);

CREATE TABLE IF NOT EXISTS audit.audit_events (
  id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  actor_user_id uuid,
  actor_type varchar(16) NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'service', 'system')),
  actor_roles jsonb,
  action_code varchar(64) NOT NULL REFERENCES audit.audit_actions(code),
  entity_type varchar(32),
  entity_id uuid,
  project_id uuid,
  diagram_id uuid,
  request_id varchar(64),
  correlation_id varchar(64),
  ip inet,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  source_event_id uuid NOT NULL,
  source_service varchar(32) NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at),
  UNIQUE (source_event_id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS audit.audit_events_default
  PARTITION OF audit.audit_events DEFAULT;

CREATE INDEX IF NOT EXISTS ix_audit_events_actor ON audit.audit_events (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_events_action ON audit.audit_events (action_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_events_project ON audit.audit_events (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_events_entity ON audit.audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_correlation ON audit.audit_events (correlation_id);

CREATE TABLE IF NOT EXISTS audit.privileged_audit_events (
  id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  actor_user_id uuid,
  actor_type varchar(16) NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'service', 'system')),
  actor_roles jsonb,
  action_code varchar(64) NOT NULL REFERENCES audit.audit_actions(code),
  entity_type varchar(32),
  entity_id uuid,
  project_id uuid,
  diagram_id uuid,
  request_id varchar(64),
  correlation_id varchar(64),
  ip inet,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  source_event_id uuid NOT NULL,
  source_service varchar(32) NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at),
  UNIQUE (source_event_id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS audit.privileged_audit_events_default
  PARTITION OF audit.privileged_audit_events DEFAULT;

CREATE INDEX IF NOT EXISTS ix_privileged_events_actor ON audit.privileged_audit_events (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_privileged_events_action ON audit.privileged_audit_events (action_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_privileged_events_project ON audit.privileged_audit_events (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_privileged_events_source ON audit.privileged_audit_events (source_event_id);

CREATE TABLE IF NOT EXISTS events.processed_events (
  consumer varchar(64) NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

-- Down Migration

DROP TABLE IF EXISTS events.processed_events;
DROP TABLE IF EXISTS audit.privileged_audit_events_default;
DROP TABLE IF EXISTS audit.privileged_audit_events;
DROP TABLE IF EXISTS audit.audit_events_default;
DROP TABLE IF EXISTS audit.audit_events;
DROP TABLE IF EXISTS audit.audit_actions;
