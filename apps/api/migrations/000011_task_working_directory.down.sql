CREATE TABLE tasks_new (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  parent_task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready', 'scoping', 'planning', 'implementation', 'review', 'done')),
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO tasks_new (
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
  state,
  created_at,
  updated_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX tasks_parent_task_id_idx ON tasks(parent_task_id);
