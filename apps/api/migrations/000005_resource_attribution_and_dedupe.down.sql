DROP INDEX IF EXISTS task_tickets_task_external_id_unique_idx;
DROP INDEX IF EXISTS task_artifacts_task_kind_uri_unique_idx;

PRAGMA foreign_keys = OFF;

CREATE TABLE task_artifacts_rollback (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  uri text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO task_artifacts_rollback (
  id,
  task_id,
  kind,
  label,
  uri,
  created_at
)
SELECT
  id,
  task_id,
  kind,
  label,
  uri,
  created_at
FROM task_artifacts;

DROP TABLE task_artifacts;
ALTER TABLE task_artifacts_rollback RENAME TO task_artifacts;
CREATE INDEX task_artifacts_task_id_idx ON task_artifacts(task_id);

CREATE TABLE task_tickets_rollback (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  url text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO task_tickets_rollback (
  id,
  task_id,
  external_id,
  url,
  created_at
)
SELECT
  id,
  task_id,
  external_id,
  url,
  created_at
FROM task_tickets;

DROP TABLE task_tickets;
ALTER TABLE task_tickets_rollback RENAME TO task_tickets;
CREATE INDEX task_tickets_task_id_idx ON task_tickets(task_id);

PRAGMA foreign_keys = ON;
