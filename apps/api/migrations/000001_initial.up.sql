CREATE TABLE tasks (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  parent_task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX tasks_parent_task_id_idx ON tasks(parent_task_id);

CREATE TABLE task_artifacts (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  uri text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX task_artifacts_task_id_idx ON task_artifacts(task_id);

CREATE TABLE task_tickets (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  url text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX task_tickets_task_id_idx ON task_tickets(task_id);
