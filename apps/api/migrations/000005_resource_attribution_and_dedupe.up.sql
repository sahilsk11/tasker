ALTER TABLE task_artifacts
ADD COLUMN created_by_session_id text REFERENCES task_sessions(id) ON DELETE SET NULL;

DELETE FROM task_artifacts
WHERE id NOT IN (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY task_id, kind, uri
        ORDER BY created_at ASC, id ASC
      ) AS resource_rank
    FROM task_artifacts
  )
  WHERE resource_rank = 1
);

DELETE FROM task_tickets
WHERE id NOT IN (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY task_id, external_id
        ORDER BY created_at ASC, id ASC
      ) AS resource_rank
    FROM task_tickets
  )
  WHERE resource_rank = 1
);

CREATE UNIQUE INDEX task_artifacts_task_kind_uri_unique_idx
ON task_artifacts(task_id, kind, uri);

CREATE UNIQUE INDEX task_tickets_task_external_id_unique_idx
ON task_tickets(task_id, external_id);
