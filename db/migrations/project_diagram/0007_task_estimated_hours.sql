ALTER TABLE plan.tasks
  ADD COLUMN IF NOT EXISTS estimated_hours numeric(8, 2);

ALTER TABLE plan.tasks
  DROP CONSTRAINT IF EXISTS tasks_estimated_hours_check;

ALTER TABLE plan.tasks
  ADD CONSTRAINT tasks_estimated_hours_check
  CHECK (estimated_hours IS NULL OR estimated_hours >= 0);

-- Down Migration
ALTER TABLE plan.tasks
  DROP CONSTRAINT IF EXISTS tasks_estimated_hours_check;

ALTER TABLE plan.tasks
  DROP COLUMN IF EXISTS estimated_hours;
