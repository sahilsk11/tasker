CREATE TABLE task_dependencies (
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE INDEX task_dependencies_depends_on_task_id_idx
  ON task_dependencies(depends_on_task_id);
