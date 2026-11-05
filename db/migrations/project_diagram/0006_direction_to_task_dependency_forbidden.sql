ALTER TABLE plan.dependencies
  DROP CONSTRAINT IF EXISTS dependencies_no_direction_to_task;

ALTER TABLE plan.dependencies
  ADD CONSTRAINT dependencies_no_direction_to_task
  CHECK (NOT (predecessor_type = 'direction' AND successor_type = 'task'));

-- Down Migration
ALTER TABLE plan.dependencies
  DROP CONSTRAINT IF EXISTS dependencies_no_direction_to_task;
