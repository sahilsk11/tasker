CREATE TABLE task_actions (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  prompt_template text NOT NULL,
  options_json text,
  enabled integer NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX task_sessions_action_id_idx ON task_sessions(action_id);
