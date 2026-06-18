CREATE TABLE working_path_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  default_working_directory text,
  default_worktree_path text NOT NULL DEFAULT '~/wt',
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO working_path_settings (id, default_working_directory, default_worktree_path)
VALUES (1, NULL, '~/wt');
