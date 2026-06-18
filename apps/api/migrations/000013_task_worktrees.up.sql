CREATE TABLE task_worktrees (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  path text NOT NULL,
  created_by_session_id text REFERENCES task_sessions(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(task_id, path)
);

CREATE INDEX task_worktrees_task_id_idx ON task_worktrees(task_id);
