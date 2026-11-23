ALTER TABLE tasks DROP COLUMN state;

ALTER TABLE task_sessions ADD COLUMN app_name text;
ALTER TABLE task_sessions ADD COLUMN client_name text;
ALTER TABLE task_sessions ADD COLUMN display_title text;
ALTER TABLE task_sessions ADD COLUMN machine_name text;
ALTER TABLE task_sessions ADD COLUMN source_url text;

UPDATE task_sessions
SET source_url = json_extract(metadata_json, '$.url')
WHERE CASE WHEN json_valid(metadata_json) THEN json_type(metadata_json, '$.url') = 'text' ELSE 0 END;

CREATE TABLE task_action_overrides (
  id text PRIMARY KEY,
  entry_json text NOT NULL,
  updated_at text NOT NULL
);
