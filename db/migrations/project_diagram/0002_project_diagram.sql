-- Up Migration

CREATE SCHEMA IF NOT EXISTS project;
CREATE SCHEMA IF NOT EXISTS plan;
CREATE SCHEMA IF NOT EXISTS jobs;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ext;

CREATE TABLE IF NOT EXISTS project.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  description text,
  owner_user_id uuid NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  purge_after timestamptz
);

CREATE INDEX IF NOT EXISTS ix_projects_owner ON project.projects (owner_user_id);
CREATE INDEX IF NOT EXISTS ix_projects_status ON project.projects (status);
CREATE INDEX IF NOT EXISTS ix_projects_deleted ON project.projects (deleted_at);
CREATE INDEX IF NOT EXISTS ix_projects_purge ON project.projects (purge_after) WHERE status = 'deleted';
CREATE INDEX IF NOT EXISTS ix_projects_name ON project.projects (lower(name));

CREATE TABLE IF NOT EXISTS project.diagrams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project.projects(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  description text,
  day_mode varchar(16) NOT NULL DEFAULT 'working' CHECK (day_mode IN ('calendar', 'working')),
  current_revision bigint NOT NULL DEFAULT 0,
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_diagrams_project ON project.diagrams (project_id);
CREATE INDEX IF NOT EXISTS ix_diagrams_deleted ON project.diagrams (deleted_at);
CREATE INDEX IF NOT EXISTS ix_diagrams_revision ON project.diagrams (current_revision);

CREATE TABLE IF NOT EXISTS plan.directions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id uuid NOT NULL REFERENCES project.diagrams(id) ON DELETE CASCADE,
  wbs_code varchar(32) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  name varchar(200) NOT NULL,
  description text,
  result text,
  priority varchar(16) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  start_date date,
  end_date date,
  jira_number varchar(40),
  bp_flag boolean NOT NULL DEFAULT false,
  sp_flag boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_directions_wbs ON plan.directions (diagram_id, wbs_code);
CREATE INDEX IF NOT EXISTS ix_directions_diagram ON plan.directions (diagram_id);
CREATE INDEX IF NOT EXISTS ix_directions_deleted ON plan.directions (deleted_at);

CREATE TABLE IF NOT EXISTS plan.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id uuid NOT NULL REFERENCES project.diagrams(id) ON DELETE CASCADE,
  direction_id uuid NOT NULL REFERENCES plan.directions(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES plan.tasks(id) ON DELETE CASCADE,
  level smallint NOT NULL CHECK (level IN (2, 3)),
  wbs_code varchar(32) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  name varchar(200) NOT NULL,
  description text,
  result text,
  status varchar(16) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done', 'blocked')),
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  priority varchar(16) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  start_date date,
  end_date date,
  actual_end_date date,
  jira_number varchar(40),
  bp_flag boolean NOT NULL DEFAULT false,
  sp_flag boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tasks_wbs ON plan.tasks (diagram_id, wbs_code);
CREATE INDEX IF NOT EXISTS ix_tasks_diagram_status ON plan.tasks (diagram_id, status);
CREATE INDEX IF NOT EXISTS ix_tasks_direction ON plan.tasks (direction_id);
CREATE INDEX IF NOT EXISTS ix_tasks_parent ON plan.tasks (parent_task_id);
CREATE INDEX IF NOT EXISTS ix_tasks_dates ON plan.tasks (start_date, end_date);
CREATE INDEX IF NOT EXISTS ix_tasks_deleted ON plan.tasks (deleted_at);

CREATE OR REPLACE FUNCTION plan.check_task_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_diagram uuid;
  parent_level smallint;
  direction_diagram uuid;
BEGIN
  SELECT diagram_id, level INTO parent_diagram, parent_level
  FROM plan.tasks WHERE id = NEW.parent_task_id;

  SELECT diagram_id INTO direction_diagram
  FROM plan.directions WHERE id = NEW.direction_id;

  IF direction_diagram IS NULL OR direction_diagram <> NEW.diagram_id THEN
    RAISE EXCEPTION 'task_direction_diagram_mismatch';
  END IF;

  IF NEW.level = 2 AND NEW.parent_task_id IS NOT NULL THEN
    RAISE EXCEPTION 'task_level2_parent_not_allowed';
  END IF;

  IF NEW.level = 3 THEN
    IF NEW.parent_task_id IS NULL THEN
      RAISE EXCEPTION 'task_level3_parent_required';
    END IF;
    IF parent_diagram IS NULL OR parent_diagram <> NEW.diagram_id OR parent_level <> 2 THEN
      RAISE EXCEPTION 'task_parent_invalid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_hierarchy ON plan.tasks;
CREATE TRIGGER trg_tasks_hierarchy
BEFORE INSERT OR UPDATE ON plan.tasks
FOR EACH ROW EXECUTE FUNCTION plan.check_task_hierarchy();

CREATE TABLE IF NOT EXISTS plan.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(16) NOT NULL CHECK (entity_type IN ('direction', 'task')),
  entity_id uuid NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('responsible', 'executor', 'co_executor')),
  assignee_type varchar(16) NOT NULL CHECK (assignee_type IN ('user', 'executor')),
  assignee_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (entity_type = 'task' OR role = 'responsible'),
  UNIQUE (entity_type, entity_id, role, assignee_type, assignee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_assignments_single_role
  ON plan.assignments (entity_type, entity_id, role)
  WHERE role IN ('responsible', 'executor');
CREATE UNIQUE INDEX IF NOT EXISTS ux_assignments_coexecutor
  ON plan.assignments (entity_type, entity_id, assignee_type, assignee_id)
  WHERE role = 'co_executor';
CREATE INDEX IF NOT EXISTS ix_assignments_entity ON plan.assignments (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_assignments_assignee ON plan.assignments (assignee_type, assignee_id);

CREATE OR REPLACE FUNCTION plan.check_assignment_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'co_executor' AND NEW.entity_type = 'task' THEN
    IF (
      SELECT count(*) FROM plan.assignments
      WHERE entity_type = 'task' AND entity_id = NEW.entity_id AND role = 'co_executor'
    ) >= 2 THEN
      RAISE EXCEPTION 'coexecutor_limit_reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignments_limit ON plan.assignments;
CREATE TRIGGER trg_assignments_limit
BEFORE INSERT ON plan.assignments
FOR EACH ROW EXECUTE FUNCTION plan.check_assignment_limit();

CREATE TABLE IF NOT EXISTS plan.dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id uuid NOT NULL REFERENCES project.diagrams(id) ON DELETE CASCADE,
  predecessor_type varchar(16) NOT NULL CHECK (predecessor_type IN ('direction', 'task')),
  predecessor_id uuid NOT NULL,
  successor_type varchar(16) NOT NULL CHECK (successor_type IN ('direction', 'task')),
  successor_id uuid NOT NULL,
  link_type varchar(16) NOT NULL DEFAULT 'finish_to_start' CHECK (link_type = 'finish_to_start'),
  color varchar(7) CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  line_style varchar(16) NOT NULL DEFAULT 'solid' CHECK (line_style IN ('solid', 'dashed', 'dotted')),
  arrow_shape varchar(16) NOT NULL DEFAULT 'orthogonal' CHECK (arrow_shape IN ('orthogonal', 'straight', 'curved')),
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (predecessor_id <> successor_id OR predecessor_type <> successor_type),
  UNIQUE (predecessor_type, predecessor_id, successor_type, successor_id)
);

CREATE INDEX IF NOT EXISTS ix_dependencies_diagram ON plan.dependencies (diagram_id);
CREATE INDEX IF NOT EXISTS ix_dependencies_predecessor ON plan.dependencies (predecessor_type, predecessor_id);
CREATE INDEX IF NOT EXISTS ix_dependencies_successor ON plan.dependencies (successor_type, successor_id);

CREATE TABLE IF NOT EXISTS plan.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(16) NOT NULL CHECK (entity_type IN ('direction', 'task')),
  entity_id uuid NOT NULL,
  author_user_id uuid,
  mentioned_user_ids uuid[],
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_comments_entity ON plan.comments (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_comments_author ON plan.comments (author_user_id);
CREATE INDEX IF NOT EXISTS ix_comments_created ON plan.comments (created_at);

CREATE TABLE IF NOT EXISTS plan.diagram_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id uuid NOT NULL REFERENCES project.diagrams(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name varchar(200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (diagram_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS ix_holidays_diagram ON plan.diagram_holidays (diagram_id);

CREATE TABLE IF NOT EXISTS plan.diagram_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  diagram_id uuid NOT NULL REFERENCES project.diagrams(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  entity_type varchar(16) NOT NULL CHECK (entity_type IN ('project', 'diagram', 'direction', 'task', 'dependency', 'comment', 'holiday')),
  entity_id uuid,
  operation varchar(16) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  payload jsonb NOT NULL,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (diagram_id, revision)
);

CREATE INDEX IF NOT EXISTS ix_changes_diagram_revision ON plan.diagram_changes (diagram_id, revision);
CREATE INDEX IF NOT EXISTS ix_changes_actor ON plan.diagram_changes (actor_user_id);
CREATE INDEX IF NOT EXISTS ix_changes_created ON plan.diagram_changes (created_at);

CREATE TABLE IF NOT EXISTS jobs.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  diagram_id uuid NOT NULL REFERENCES project.diagrams(id) ON DELETE CASCADE,
  initiator_user_id uuid NOT NULL,
  format varchar(16) NOT NULL CHECK (format IN ('json', 'csv')),
  status varchar(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  file_name varchar(255),
  size_bytes bigint NOT NULL CHECK (size_bytes <= 52428800),
  payload bytea,
  report jsonb,
  error_code varchar(64),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_import_jobs_active
  ON jobs.import_jobs (diagram_id)
  WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS ix_import_jobs_status ON jobs.import_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS ix_import_jobs_diagram ON jobs.import_jobs (diagram_id);
CREATE INDEX IF NOT EXISTS ix_import_jobs_user ON jobs.import_jobs (initiator_user_id);

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

CREATE INDEX IF NOT EXISTS ix_project_outbox_unpublished ON events.outbox_events (published_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_project_outbox_aggregate ON events.outbox_events (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS ix_project_outbox_occurred ON events.outbox_events (occurred_at);

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
DROP TABLE IF EXISTS jobs.import_jobs;
DROP TABLE IF EXISTS plan.diagram_changes;
DROP TABLE IF EXISTS plan.diagram_holidays;
DROP TABLE IF EXISTS plan.comments;
DROP TABLE IF EXISTS plan.dependencies;
DROP TRIGGER IF EXISTS trg_assignments_limit ON plan.assignments;
DROP FUNCTION IF EXISTS plan.check_assignment_limit();
DROP TABLE IF EXISTS plan.assignments;
DROP TRIGGER IF EXISTS trg_tasks_hierarchy ON plan.tasks;
DROP FUNCTION IF EXISTS plan.check_task_hierarchy();
DROP TABLE IF EXISTS plan.tasks;
DROP TABLE IF EXISTS plan.directions;
DROP TABLE IF EXISTS project.diagrams;
DROP TABLE IF EXISTS project.projects;
