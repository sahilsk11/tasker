DROP INDEX IF EXISTS task_artifacts_task_archived_created_at_idx;

CREATE TABLE task_artifacts_rollback (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('research', 'plan', 'implement', 'other')),
  uri text NOT NULL,
  dedupe_key text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by_session_id text REFERENCES task_sessions(id) ON DELETE SET NULL
);

INSERT INTO task_artifacts_rollback (
  id,
  task_id,
  label,
  uri,
  dedupe_key,
  created_at,
  created_by_session_id
)
SELECT
  id,
  task_id,
  label,
  uri,
  dedupe_key,
  created_at,
  created_by_session_id
FROM task_artifacts;

DROP TABLE task_artifacts;
ALTER TABLE task_artifacts_rollback RENAME TO task_artifacts;

CREATE INDEX task_artifacts_task_id_idx ON task_artifacts(task_id);
CREATE UNIQUE INDEX task_artifacts_task_dedupe_key_unique_idx
ON task_artifacts(task_id, dedupe_key);
