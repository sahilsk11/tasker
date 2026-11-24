CREATE TABLE task_session_messages (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES task_sessions(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  ordinal integer NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  text text NOT NULL,
  content_hash text NOT NULL,
  occurred_at text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  UNIQUE (session_id, external_id)
);

CREATE INDEX task_session_messages_session_ordinal_idx
ON task_session_messages(session_id, ordinal);
