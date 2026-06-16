ALTER TABLE tasks
ADD COLUMN state text NOT NULL DEFAULT 'ready'
CHECK (state IN ('ready', 'research', 'plan', 'implement', 'code_review', 'merged', 'done'));

CREATE TABLE task_pull_requests (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  url text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO task_pull_requests (id, task_id, url, created_at)
SELECT id, task_id, uri, created_at
FROM task_artifacts
WHERE lower(kind) IN ('pr', 'pull_request', 'pull-request');

DELETE FROM task_artifacts
WHERE lower(kind) IN ('pr', 'pull_request', 'pull-request');

DROP INDEX IF EXISTS task_artifacts_task_kind_uri_unique_idx;
DROP INDEX IF EXISTS task_artifacts_task_id_idx;

PRAGMA foreign_keys = OFF;

CREATE TABLE task_artifacts_next (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('research', 'plan', 'implement', 'other')),
  uri text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by_session_id text REFERENCES task_sessions(id) ON DELETE SET NULL
);

INSERT INTO task_artifacts_next (
  id,
  task_id,
  label,
  uri,
  created_at,
  created_by_session_id
)
SELECT
  id,
  task_id,
  CASE
    WHEN lower(kind) IN ('research', 'plan', 'implement') THEN lower(kind)
    WHEN lower(label) IN ('research', 'plan', 'implement') THEN lower(label)
    ELSE 'other'
  END,
  uri,
  created_at,
  created_by_session_id
FROM task_artifacts
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY
          task_id,
          CASE
            WHEN lower(kind) IN ('research', 'plan', 'implement') THEN lower(kind)
            WHEN lower(label) IN ('research', 'plan', 'implement') THEN lower(label)
            ELSE 'other'
          END,
          uri
        ORDER BY created_at ASC, id ASC
      ) AS resource_rank
    FROM task_artifacts
  )
  WHERE resource_rank = 1
);

DROP TABLE task_artifacts;
ALTER TABLE task_artifacts_next RENAME TO task_artifacts;

PRAGMA foreign_keys = ON;

CREATE INDEX task_artifacts_task_id_idx ON task_artifacts(task_id);
CREATE UNIQUE INDEX task_artifacts_task_label_uri_unique_idx
ON task_artifacts(task_id, label, uri);

CREATE INDEX task_pull_requests_task_id_idx ON task_pull_requests(task_id);

DELETE FROM task_pull_requests
WHERE id NOT IN (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY task_id, url
        ORDER BY created_at ASC, id ASC
      ) AS resource_rank
    FROM task_pull_requests
  )
  WHERE resource_rank = 1
);

CREATE UNIQUE INDEX task_pull_requests_task_url_unique_idx
ON task_pull_requests(task_id, url);

UPDATE tasks
SET state = 'research'
WHERE id IN (
  SELECT DISTINCT task_id FROM task_artifacts WHERE label = 'research'
);

UPDATE tasks
SET state = 'plan'
WHERE id IN (
  SELECT DISTINCT task_id FROM task_artifacts WHERE label = 'plan'
);

UPDATE tasks
SET state = 'implement'
WHERE id IN (
  SELECT DISTINCT task_id FROM task_artifacts WHERE label = 'implement'
);

UPDATE tasks
SET state = 'code_review'
WHERE id IN (
  SELECT DISTINCT task_id FROM task_pull_requests
);
