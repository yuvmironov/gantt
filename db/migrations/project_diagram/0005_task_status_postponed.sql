ALTER TABLE plan.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE plan.tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('planned', 'in_progress', 'done', 'blocked', 'postponed'));

-- Down Migration
ALTER TABLE plan.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE plan.tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('planned', 'in_progress', 'done', 'blocked'));
