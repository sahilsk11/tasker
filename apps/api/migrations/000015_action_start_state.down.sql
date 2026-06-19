CREATE TABLE task_actions_new (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  prompt_template text NOT NULL,
  options_json text,
  enabled integer NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  icon_name text,
  recommendation_states_json text
);

INSERT INTO task_actions_new (
  id,
  label,
  description,
  prompt_template,
  options_json,
  enabled,
  sort_order,
  created_at,
  updated_at,
  icon_name,
  recommendation_states_json
)
SELECT
  id,
  label,
  description,
  prompt_template,
  options_json,
  enabled,
  sort_order,
  created_at,
  updated_at,
  icon_name,
  recommendation_states_json
FROM task_actions;

DROP TABLE task_actions;
ALTER TABLE task_actions_new RENAME TO task_actions;
