ALTER TABLE task_sessions ADD COLUMN title text NOT NULL DEFAULT 'New Session';
ALTER TABLE task_sessions ADD COLUMN local_path text NOT NULL DEFAULT '';
ALTER TABLE task_sessions ADD COLUMN model text;
ALTER TABLE task_sessions ADD COLUMN plan_mode integer NOT NULL DEFAULT 0;
ALTER TABLE task_sessions ADD COLUMN status text NOT NULL DEFAULT 'idle';
ALTER TABLE task_sessions ADD COLUMN session_token text;
ALTER TABLE task_sessions ADD COLUMN pending_fork_session_token text;
ALTER TABLE task_sessions ADD COLUMN last_turn_outcome text;
ALTER TABLE task_sessions ADD COLUMN last_message_at text;
ALTER TABLE task_sessions ADD COLUMN updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE task_session_transcript_entries (
  id text PRIMARY KEY,
  task_session_id text NOT NULL REFERENCES task_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  message_id text,
  hidden integer NOT NULL DEFAULT 0,
  payload_json text NOT NULL,
  created_at integer NOT NULL
);

CREATE INDEX task_session_transcript_entries_session_id_created_at_idx
  ON task_session_transcript_entries(task_session_id, created_at, id);

CREATE INDEX task_session_transcript_entries_session_id_message_id_idx
  ON task_session_transcript_entries(task_session_id, message_id)
  WHERE message_id IS NOT NULL;
