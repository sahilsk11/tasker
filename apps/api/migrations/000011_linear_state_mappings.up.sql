CREATE TABLE linear_state_mappings (
  team_id text NOT NULL,
  task_state text NOT NULL CHECK (
    task_state IN (
      'ready',
      'scoping',
      'planning',
      'implementation',
      'review',
      'done'
    )
  ),
  linear_state_id text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (team_id, task_state)
);
