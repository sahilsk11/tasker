-- Schema from the Node API migrations through 000016.

CREATE TABLE tasks (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  parent_task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'ready',
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  working_directory text
);

CREATE TABLE task_sessions (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  provider text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  action_id text,
  provider_id text,
  transcript_path text,
  metadata_json text,
  claimed_at text
);

CREATE TABLE task_tickets (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  url text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE task_pull_requests (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  url text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE task_artifacts (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (label IN ('research', 'plan', 'implement', 'other')),
  uri text NOT NULL,
  dedupe_key text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by_session_id text REFERENCES task_sessions(id) ON DELETE SET NULL,
  archived_at text DEFAULT NULL
);

CREATE TABLE task_dependencies (
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE working_path_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  default_working_directory text,
  default_worktree_path text NOT NULL DEFAULT '~/wt',
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX task_sessions_task_id_idx ON task_sessions(task_id);

CREATE INDEX task_tickets_task_id_idx ON task_tickets(task_id);

CREATE UNIQUE INDEX task_tickets_task_external_id_unique_idx
ON task_tickets(task_id, external_id);

CREATE INDEX task_artifacts_task_id_idx ON task_artifacts(task_id);

CREATE UNIQUE INDEX task_artifacts_task_dedupe_key_unique_idx
ON task_artifacts(task_id, dedupe_key);

CREATE INDEX task_pull_requests_task_id_idx ON task_pull_requests(task_id);

CREATE UNIQUE INDEX task_pull_requests_task_url_unique_idx
ON task_pull_requests(task_id, url);

CREATE INDEX task_sessions_action_id_idx ON task_sessions(action_id);

CREATE INDEX tasks_parent_task_id_idx ON tasks(parent_task_id);

CREATE INDEX task_dependencies_depends_on_task_id_idx
  ON task_dependencies(depends_on_task_id);

CREATE INDEX task_artifacts_task_archived_created_at_idx
ON task_artifacts(task_id, archived_at, created_at);

INSERT INTO working_path_settings (id) VALUES (1);
