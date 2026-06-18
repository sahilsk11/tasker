CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value_json text NOT NULL,
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
