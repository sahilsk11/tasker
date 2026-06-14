ALTER TABLE task_sessions ADD COLUMN action_id text;
ALTER TABLE task_sessions ADD COLUMN provider_id text;
ALTER TABLE task_sessions ADD COLUMN transcript_path text;
ALTER TABLE task_sessions ADD COLUMN metadata_json text;
ALTER TABLE task_sessions ADD COLUMN claimed_at text;

UPDATE task_sessions
SET claimed_at = created_at
WHERE claimed_at IS NULL;
