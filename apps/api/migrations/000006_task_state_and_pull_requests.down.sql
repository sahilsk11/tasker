DROP INDEX IF EXISTS task_pull_requests_task_url_unique_idx;
DROP INDEX IF EXISTS task_pull_requests_task_id_idx;

DROP INDEX IF EXISTS task_artifacts_task_dedupe_key_unique_idx;
DROP INDEX IF EXISTS task_artifacts_task_id_idx;

PRAGMA foreign_keys = OFF;

CREATE TABLE task_artifacts_rollback (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  uri text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by_session_id text REFERENCES task_sessions(id) ON DELETE SET NULL
);

INSERT INTO task_artifacts_rollback (
  id,
  task_id,
  kind,
  label,
  uri,
  created_at,
  created_by_session_id
)
SELECT
  id,
  task_id,
  CASE
    WHEN row_number() OVER (
      PARTITION BY task_id, label, uri
      ORDER BY created_at ASC, id ASC
    ) = 1 THEN label
    ELSE 'legacy_artifact_' || id
  END,
  label,
  uri,
  created_at,
  created_by_session_id
FROM task_artifacts;

INSERT INTO task_artifacts_rollback (
  id,
  task_id,
  kind,
  label,
  uri,
  created_at,
  created_by_session_id
)
SELECT
  id,
  task_id,
  'pr',
  'Pull request',
  url,
  created_at,
  NULL
FROM task_pull_requests;

DROP TABLE task_artifacts;
ALTER TABLE task_artifacts_rollback RENAME TO task_artifacts;
DROP TABLE task_pull_requests;

CREATE TABLE tasks_rollback (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  parent_task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO tasks_rollback (
  id,
  title,
  description,
  parent_task_id,
  created_at,
  updated_at
)
SELECT
  id,
  title,
  description,
  parent_task_id,
  created_at,
  updated_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_rollback RENAME TO tasks;

PRAGMA foreign_keys = ON;

CREATE INDEX task_artifacts_task_id_idx ON task_artifacts(task_id);
CREATE UNIQUE INDEX task_artifacts_task_kind_uri_unique_idx
ON task_artifacts(task_id, kind, uri);
CREATE INDEX tasks_parent_task_id_idx ON tasks(parent_task_id);
