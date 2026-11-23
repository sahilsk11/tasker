DROP TABLE task_action_overrides;
ALTER TABLE task_sessions DROP COLUMN app_name;
ALTER TABLE task_sessions DROP COLUMN client_name;
ALTER TABLE task_sessions DROP COLUMN display_title;
ALTER TABLE task_sessions DROP COLUMN machine_name;
ALTER TABLE task_sessions DROP COLUMN source_url;
ALTER TABLE tasks ADD COLUMN state text NOT NULL DEFAULT 'ready';
