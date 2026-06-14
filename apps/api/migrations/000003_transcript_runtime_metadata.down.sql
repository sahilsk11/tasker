DROP INDEX IF EXISTS task_session_transcript_entries_session_item_idx;
DROP INDEX IF EXISTS task_session_transcript_entries_session_turn_sequence_idx;

CREATE TABLE task_session_transcript_entries_new (
  id text PRIMARY KEY,
  task_session_id text NOT NULL REFERENCES task_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  message_id text,
  hidden integer NOT NULL DEFAULT 0,
  payload_json text NOT NULL,
  created_at integer NOT NULL
);

INSERT INTO task_session_transcript_entries_new (
  id,
  task_session_id,
  kind,
  message_id,
  hidden,
  payload_json,
  created_at
)
SELECT
  id,
  task_session_id,
  kind,
  message_id,
  hidden,
  payload_json,
  created_at
FROM task_session_transcript_entries;

DROP TABLE task_session_transcript_entries;
ALTER TABLE task_session_transcript_entries_new RENAME TO task_session_transcript_entries;

CREATE INDEX task_session_transcript_entries_session_id_created_at_idx
  ON task_session_transcript_entries(task_session_id, created_at, id);

CREATE INDEX task_session_transcript_entries_session_id_message_id_idx
  ON task_session_transcript_entries(task_session_id, message_id)
  WHERE message_id IS NOT NULL;
