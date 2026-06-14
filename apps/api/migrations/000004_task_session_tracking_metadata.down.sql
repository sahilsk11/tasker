PRAGMA foreign_keys = OFF;

CREATE TABLE task_sessions_rollback (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  provider text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  title text NOT NULL DEFAULT 'New Session',
  local_path text NOT NULL DEFAULT '',
  model text,
  plan_mode integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'idle',
  session_token text,
  pending_fork_session_token text,
  last_turn_outcome text,
  last_message_at text,
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO task_sessions_rollback (
  id,
  task_id,
  provider,
  created_at,
  title,
  local_path,
  model,
  plan_mode,
  status,
  session_token,
  pending_fork_session_token,
  last_turn_outcome,
  last_message_at,
  updated_at
)
SELECT
  id,
  task_id,
  provider,
  created_at,
  title,
  local_path,
  model,
  plan_mode,
  status,
  session_token,
  pending_fork_session_token,
  last_turn_outcome,
  last_message_at,
  updated_at
FROM task_sessions;

DROP TABLE task_sessions;
ALTER TABLE task_sessions_rollback RENAME TO task_sessions;

CREATE INDEX task_sessions_task_id_idx ON task_sessions(task_id);

PRAGMA foreign_keys = ON;
