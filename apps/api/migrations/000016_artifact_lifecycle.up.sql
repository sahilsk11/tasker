ALTER TABLE task_artifacts
ADD COLUMN archived_at text DEFAULT NULL;

CREATE INDEX task_artifacts_task_archived_created_at_idx
ON task_artifacts(task_id, archived_at, created_at);
