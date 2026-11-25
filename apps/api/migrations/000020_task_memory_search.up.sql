CREATE TABLE task_memory_search_jobs (
  job_key text PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('task', 'session', 'message')),
  entity_id text NOT NULL,
  task_id text NOT NULL,
  generation_token text NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  next_chunk integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  queued_at text NOT NULL,
  available_at text NOT NULL,
  claimed_at text,
  lease_token text,
  last_error text
);

CREATE INDEX task_memory_search_jobs_available_idx
  ON task_memory_search_jobs(available_at, queued_at);

CREATE TABLE task_memory_search_documents (
  rowid integer PRIMARY KEY AUTOINCREMENT,
  vector_id text NOT NULL UNIQUE,
  task_id text NOT NULL,
  session_id text,
  message_id text,
  source_type text NOT NULL CHECK (
    source_type IN ('task_title', 'session_title', 'message')
  ),
  role text,
  ordinal integer,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT ''
);

CREATE INDEX task_memory_search_documents_task_idx
  ON task_memory_search_documents(task_id, source_type);
CREATE INDEX task_memory_search_documents_session_idx
  ON task_memory_search_documents(session_id, source_type);
CREATE INDEX task_memory_search_documents_message_idx
  ON task_memory_search_documents(message_id);

CREATE VIRTUAL TABLE task_memory_search_fts USING fts5(
  title,
  body,
  content='task_memory_search_documents',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER task_memory_search_fts_insert
AFTER INSERT ON task_memory_search_documents
BEGIN
  INSERT INTO task_memory_search_fts(rowid, title, body)
  VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER task_memory_search_fts_delete
AFTER DELETE ON task_memory_search_documents
BEGIN
  INSERT INTO task_memory_search_fts(task_memory_search_fts, rowid, title, body)
  VALUES ('delete', old.rowid, old.title, old.body);
END;

CREATE TRIGGER task_memory_search_fts_update
AFTER UPDATE ON task_memory_search_documents
BEGIN
  INSERT INTO task_memory_search_fts(task_memory_search_fts, rowid, title, body)
  VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO task_memory_search_fts(rowid, title, body)
  VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER task_memory_search_task_insert
AFTER INSERT ON tasks
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  ) VALUES (
    'task:' || new.id, 'task', new.id, new.id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_task_title_update
AFTER UPDATE OF title ON tasks
WHEN old.title IS NOT new.title
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  ) VALUES (
    'task:' || new.id, 'task', new.id, new.id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;

  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  )
  SELECT
    'session:' || s.id, 'session', s.id, s.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM task_sessions AS s
  WHERE s.task_id = new.id
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;

  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  )
  SELECT
    'message:' || m.id, 'message', m.id, s.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM task_session_messages AS m
  JOIN task_sessions AS s ON s.id = m.session_id
  WHERE s.task_id = new.id
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_task_delete
AFTER DELETE ON tasks
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  ) VALUES (
    'task:' || old.id, 'task', old.id, old.id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_session_insert
AFTER INSERT ON task_sessions
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  ) VALUES (
    'session:' || new.id, 'session', new.id, new.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_session_title_update
AFTER UPDATE OF display_title ON task_sessions
WHEN old.display_title IS NOT new.display_title
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  ) VALUES (
    'session:' || new.id, 'session', new.id, new.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;

  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  )
  SELECT
    'message:' || id, 'message', id, new.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM task_session_messages
  WHERE session_id = new.id
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_session_delete
AFTER DELETE ON task_sessions
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  ) VALUES (
    'session:' || old.id, 'session', old.id, old.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_message_insert
AFTER INSERT ON task_session_messages
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  )
  SELECT
    'message:' || new.id, 'message', new.id, s.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM task_sessions AS s
  WHERE s.id = new.session_id
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_message_update
AFTER UPDATE OF text, role, ordinal, session_id ON task_session_messages
WHEN old.text IS NOT new.text
  OR old.role IS NOT new.role
  OR old.ordinal IS NOT new.ordinal
  OR old.session_id IS NOT new.session_id
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  )
  SELECT
    'message:' || new.id, 'message', new.id, s.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM task_sessions AS s
  WHERE s.id = new.session_id
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_message_delete
AFTER DELETE ON task_session_messages
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  ) VALUES (
    'message:' || old.id, 'message', old.id,
    coalesce((SELECT task_id FROM task_sessions WHERE id = old.session_id), ''),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    next_chunk = 0, attempts = 0, queued_at = excluded.queued_at,
    available_at = excluded.available_at, claimed_at = NULL,
    lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_session_task_update
AFTER UPDATE OF task_id ON task_sessions
WHEN old.task_id IS NOT new.task_id
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  ) VALUES (
    'session:' || new.id, 'session', new.id, new.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

CREATE TRIGGER task_memory_search_message_task_update
AFTER UPDATE OF task_id ON task_sessions
WHEN old.task_id IS NOT new.task_id
BEGIN
  INSERT INTO task_memory_search_jobs (
    job_key, entity_type, entity_id, task_id, queued_at, available_at
  )
  SELECT
    'message:' || m.id, 'message', m.id, new.task_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM task_session_messages AS m
  WHERE m.session_id = new.id
  ON CONFLICT(job_key) DO UPDATE SET
    generation_token = excluded.generation_token,
    task_id = excluded.task_id, next_chunk = 0, attempts = 0,
    queued_at = excluded.queued_at, available_at = excluded.available_at,
    claimed_at = NULL, lease_token = NULL, last_error = NULL;
END;

INSERT INTO task_memory_search_jobs (
  job_key, entity_type, entity_id, task_id, queued_at, available_at
)
SELECT 'task:' || id, 'task', id, id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tasks;

INSERT INTO task_memory_search_jobs (
  job_key, entity_type, entity_id, task_id, queued_at, available_at
)
SELECT 'session:' || id, 'session', id, task_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM task_sessions;

INSERT INTO task_memory_search_jobs (
  job_key, entity_type, entity_id, task_id, queued_at, available_at
)
SELECT 'message:' || m.id, 'message', m.id, s.task_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM task_session_messages AS m
JOIN task_sessions AS s ON s.id = m.session_id;

CREATE VIRTUAL TABLE task_memory_search_vectors USING vec0(
  embedding float[384] distance_metric=cosine
);
