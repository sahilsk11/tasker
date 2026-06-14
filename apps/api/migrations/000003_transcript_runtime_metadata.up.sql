ALTER TABLE task_session_transcript_entries ADD COLUMN turn_id text;
ALTER TABLE task_session_transcript_entries ADD COLUMN item_id text;
ALTER TABLE task_session_transcript_entries ADD COLUMN sequence integer;
ALTER TABLE task_session_transcript_entries ADD COLUMN lifecycle text;
ALTER TABLE task_session_transcript_entries ADD COLUMN display text;

CREATE INDEX task_session_transcript_entries_session_turn_sequence_idx
  ON task_session_transcript_entries(task_session_id, turn_id, sequence, id)
  WHERE turn_id IS NOT NULL;

CREATE INDEX task_session_transcript_entries_session_item_idx
  ON task_session_transcript_entries(task_session_id, item_id)
  WHERE item_id IS NOT NULL;
