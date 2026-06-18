DROP INDEX IF EXISTS tasks_parent_task_id_idx;

CREATE TEMP TABLE task_artifacts_snapshot AS SELECT * FROM task_artifacts;
CREATE TEMP TABLE task_pull_requests_snapshot AS SELECT * FROM task_pull_requests;
CREATE TEMP TABLE task_sessions_snapshot AS SELECT * FROM task_sessions;
CREATE TEMP TABLE task_tickets_snapshot AS SELECT * FROM task_tickets;

CREATE TABLE tasks_next (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  parent_task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'ready',
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO tasks_next (
  id,
  title,
  description,
  parent_task_id,
  state,
  created_at,
  updated_at
)
SELECT
  id,
  title,
  description,
  parent_task_id,
  CASE state
    WHEN 'research' THEN 'scoping'
    WHEN 'plan' THEN 'planning'
    WHEN 'implement' THEN 'implementation'
    WHEN 'code_review' THEN 'review'
    WHEN 'merged' THEN 'review'
    ELSE state
  END,
  created_at,
  updated_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_next RENAME TO tasks;

INSERT INTO task_sessions SELECT * FROM task_sessions_snapshot;
INSERT INTO task_artifacts SELECT * FROM task_artifacts_snapshot;
INSERT INTO task_pull_requests SELECT * FROM task_pull_requests_snapshot;
INSERT INTO task_tickets SELECT * FROM task_tickets_snapshot;

DROP TABLE task_artifacts_snapshot;
DROP TABLE task_pull_requests_snapshot;
DROP TABLE task_sessions_snapshot;
DROP TABLE task_tickets_snapshot;

CREATE INDEX tasks_parent_task_id_idx ON tasks(parent_task_id);
