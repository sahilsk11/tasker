import SqliteDatabase from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type {
  TaskMemoryIndexDocument,
  TaskMemoryIndexSource,
  TaskMemorySearchCandidate,
  TaskMemorySearchIndexStatus,
  TaskMemorySearchJob,
  TaskMemorySearchRepository
} from "../domain/task-memory-search.js";

const LOCAL_VECTOR_DIMENSIONS = 384;
const JOB_LEASE_MS = 5 * 60_000;

type JobRow = {
  attempts: number;
  entity_id: string;
  entity_type: "message" | "session" | "task";
  job_key: string;
  next_chunk: number;
  task_id: string;
  lease_token: string;
};

type TaskSourceRow = {
  task_id: string;
  task_title: string;
};

type SessionSourceRow = TaskSourceRow & {
  session_id: string;
  session_title: string | null;
};

type MessageSourceRow = SessionSourceRow & {
  message_id: string;
  message_ordinal: number;
  message_role: string;
  message_text: string;
};

type CandidateRow = {
  body: string;
  message_id: string | null;
  message_ordinal: number | null;
  message_role: string | null;
  parent_task_id: string | null;
  session_id: string | null;
  session_source_url: string | null;
  session_title: string | null;
  semantic_similarity: number | null;
  source_type: "message" | "session_title" | "task_title";
  task_id: string;
  task_title: string;
  title: string;
  vector_id: string;
};

export class SqliteTaskMemorySearchRepository
implements TaskMemorySearchRepository {
  private readonly database: SqliteDatabase.Database;

  public constructor(databasePath: string) {
    this.database = new SqliteDatabase(databasePath);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
    sqliteVec.load(this.database);
  }

  public claimJobs(limit: number): readonly TaskMemorySearchJob[] {
    const now = new Date();
    const leaseToken = crypto.randomUUID();
    const staleBefore = new Date(now.getTime() - JOB_LEASE_MS).toISOString();
    this.database
      .prepare(
        `
          UPDATE task_memory_search_jobs
          SET lease_token = ?, claimed_at = ?, attempts = attempts + 1
          WHERE job_key IN (
            SELECT job_key
            FROM task_memory_search_jobs
            WHERE available_at <= ?
              AND (claimed_at IS NULL OR claimed_at < ?)
            ORDER BY queued_at, job_key
            LIMIT ?
          )
        `
      )
      .run(leaseToken, now.toISOString(), now.toISOString(), staleBefore, limit);

    return this.database
      .prepare(
        `
          SELECT job_key, entity_type, entity_id, task_id, next_chunk,
            attempts, lease_token
          FROM task_memory_search_jobs
          WHERE lease_token = ?
          ORDER BY queued_at, job_key
        `
      )
      .all(leaseToken)
      .map((row) => toJob(row as JobRow));
  }

  public getSource(job: TaskMemorySearchJob): TaskMemoryIndexSource | null {
    if (job.entityType === "task") {
      const row = this.database
        .prepare(
          `
            SELECT id AS task_id, title AS task_title
            FROM tasks
            WHERE id = ?
          `
        )
        .get(job.entityId) as TaskSourceRow | undefined;
      return row == null
        ? null
        : { taskId: row.task_id, taskTitle: row.task_title, type: "task_title" };
    }

    if (job.entityType === "session") {
      const row = this.database
        .prepare(
          `
            SELECT s.id AS session_id, s.display_title AS session_title,
              s.source_url AS session_source_url,
              t.id AS task_id, t.title AS task_title
            FROM task_sessions AS s
            JOIN tasks AS t ON t.id = s.task_id
            WHERE s.id = ?
          `
        )
        .get(job.entityId) as SessionSourceRow | undefined;
      return row == null
        ? null
        : {
            sessionId: row.session_id,
            sessionTitle: row.session_title ?? null,
            taskId: row.task_id,
            taskTitle: row.task_title,
            type: "session_title"
          };
    }

    const row = this.database
      .prepare(
        `
          SELECT m.id AS message_id, m.ordinal AS message_ordinal,
            m.role AS message_role, m.text AS message_text,
            s.id AS session_id, s.display_title AS session_title,
            s.source_url AS session_source_url,
            t.id AS task_id, t.title AS task_title
          FROM task_session_messages AS m
          JOIN task_sessions AS s ON s.id = m.session_id
          JOIN tasks AS t ON t.id = s.task_id
          WHERE m.id = ?
        `
      )
      .get(job.entityId) as MessageSourceRow | undefined;
    return row == null
      ? null
      : {
          messageId: row.message_id,
          ordinal: row.message_ordinal,
          role: row.message_role,
          sessionId: row.session_id,
          sessionTitle: row.session_title ?? null,
          taskId: row.task_id,
          taskTitle: row.task_title,
          text: row.message_text,
          type: "message"
        };
  }

  public persistDocuments(
    documents: readonly TaskMemoryIndexDocument[],
    embeddings: readonly Float32Array[]
  ): void {
    if (documents.length !== embeddings.length) {
      throw new Error("Each search document must have one embedding");
    }
    const insertDocument = this.database.prepare(
      `
        INSERT INTO task_memory_search_documents (
          vector_id, task_id, session_id, message_id, source_type, role,
          ordinal, chunk_index, title, body, embedding_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(vector_id) DO UPDATE SET
          task_id = excluded.task_id,
          session_id = excluded.session_id,
          message_id = excluded.message_id,
          source_type = excluded.source_type,
          role = excluded.role,
          ordinal = excluded.ordinal,
          chunk_index = excluded.chunk_index,
          title = excluded.title,
          body = excluded.body,
          embedding_text = excluded.embedding_text
        RETURNING rowid
      `
    );
    const deleteVector = this.database.prepare(
      "DELETE FROM task_memory_search_vectors WHERE rowid = ?"
    );
    const insertVector = this.database.prepare(
      `
        INSERT INTO task_memory_search_vectors (rowid, embedding)
        VALUES (CAST(? AS INTEGER), ?)
      `
    );

    const persist = this.database.transaction(() => {
      for (let index = 0; index < documents.length; index += 1) {
        const document = documents[index];
        const embedding = embeddings[index];
        if (document == null || embedding == null) {
          throw new Error("Search document batch is incomplete");
        }
        if (embedding.length !== LOCAL_VECTOR_DIMENSIONS) {
          throw new Error("Local embedding dimension did not match the index");
        }
        const row = insertDocument.get(
          document.vectorId,
          document.taskId,
          document.sessionId,
          document.messageId,
          document.sourceType,
          document.messageRole,
          document.messageOrdinal,
          document.chunkIndex,
          document.title,
          document.body,
          document.embeddingText
        ) as { rowid: number };
        deleteVector.run(row.rowid);
        insertVector.run(
          row.rowid,
          Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)
        );
      }
    });
    persist();
  }

  public completeJob(job: TaskMemorySearchJob, nextChunk: number | null): void {
    if (nextChunk == null) {
      this.database
        .prepare(
          "DELETE FROM task_memory_search_jobs WHERE job_key = ? AND lease_token = ?"
        )
        .run(job.key, job.leaseToken);
      return;
    }
    this.database
      .prepare(
        `
          UPDATE task_memory_search_jobs
          SET next_chunk = ?, lease_token = NULL, claimed_at = NULL
          WHERE job_key = ? AND lease_token = ?
        `
      )
      .run(nextChunk, job.key, job.leaseToken);
  }

  public deleteSource(job: TaskMemorySearchJob): void {
    const predicate = sourcePredicate(job);
    const remove = this.database.transaction(() => {
      this.database
        .prepare(
          `
            DELETE FROM task_memory_search_vectors
            WHERE rowid IN (
              SELECT rowid FROM task_memory_search_documents WHERE ${predicate.sql}
            )
          `
        )
        .run(...predicate.parameters);
      this.database
        .prepare(
          `DELETE FROM task_memory_search_documents WHERE ${predicate.sql}`
        )
        .run(...predicate.parameters);
    });
    remove();
  }

  public failJob(job: TaskMemorySearchJob, retryAt: string): void {
    this.database
      .prepare(
        `
          UPDATE task_memory_search_jobs
          SET available_at = ?, lease_token = NULL, claimed_at = NULL,
            last_error = 'Semantic indexing failed; retry scheduled'
          WHERE job_key = ? AND lease_token = ?
        `
      )
      .run(retryAt, job.key, job.leaseToken);
  }

  public lexicalSearch(
    expression: string,
    limit: number
  ): readonly TaskMemorySearchCandidate[] {
    const rows = this.database
      .prepare(
        `
          SELECT d.vector_id, d.source_type, d.task_id,
            t.parent_task_id, t.title AS task_title, d.session_id,
            s.display_title AS session_title, s.source_url AS session_source_url,
            d.message_id,
            d.role AS message_role, d.ordinal AS message_ordinal,
            d.title, d.body, NULL AS semantic_similarity
          FROM task_memory_search_fts AS f
          JOIN task_memory_search_documents AS d ON d.rowid = f.rowid
          JOIN tasks AS t ON t.id = d.task_id
          LEFT JOIN task_sessions AS s ON s.id = d.session_id
          WHERE task_memory_search_fts MATCH ?
          ORDER BY bm25(task_memory_search_fts, 8.0, 1.0), d.vector_id
          LIMIT ?
        `
      )
      .all(expression, limit) as CandidateRow[];
    return rows.map(toCandidate);
  }

  public vectorSearch(
    embedding: Float32Array,
    limit: number
  ): readonly TaskMemorySearchCandidate[] {
    const rows = this.database
      .prepare(
        `
          SELECT d.vector_id, d.source_type, d.task_id,
            t.parent_task_id, t.title AS task_title, d.session_id,
            s.display_title AS session_title, s.source_url AS session_source_url,
            d.message_id,
            d.role AS message_role, d.ordinal AS message_ordinal,
            d.title, d.body, 1.0 - v.distance AS semantic_similarity
          FROM task_memory_search_vectors AS v
          JOIN task_memory_search_documents AS d ON d.rowid = v.rowid
          JOIN tasks AS t ON t.id = d.task_id
          LEFT JOIN task_sessions AS s ON s.id = d.session_id
          WHERE v.embedding MATCH ? AND k = ?
          ORDER BY v.distance, d.vector_id
        `
      )
      .all(
        Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength),
        limit
      ) as CandidateRow[];
    return rows.map(toCandidate);
  }

  public getIndexStatus(): TaskMemorySearchIndexStatus {
    const row = this.database
      .prepare(
        `
          SELECT
            (SELECT count(*) FROM task_memory_search_documents) AS indexed_documents,
            (SELECT count(*) FROM task_memory_search_jobs) AS pending_jobs
        `
      )
      .get() as { indexed_documents: number; pending_jobs: number };
    return {
      indexedDocuments: row.indexed_documents,
      pendingJobs: row.pending_jobs
    };
  }

  public close(): void {
    this.database.close();
  }
}

function sourcePredicate(
  job: TaskMemorySearchJob
): { readonly parameters: readonly string[]; readonly sql: string } {
  switch (job.entityType) {
    case "task":
      return { parameters: [job.entityId], sql: "source_type = 'task_title' AND task_id = ?" };
    case "session":
      return {
        parameters: [job.entityId],
        sql: "source_type = 'session_title' AND session_id = ?"
      };
    case "message":
      return {
        parameters: [job.entityId],
        sql: "source_type = 'message' AND message_id = ?"
      };
  }
}

function toJob(row: JobRow): TaskMemorySearchJob {
  return {
    attempts: row.attempts,
    entityId: row.entity_id,
    entityType: row.entity_type,
    key: row.job_key,
    leaseToken: row.lease_token,
    nextChunk: row.next_chunk,
    taskId: row.task_id
  };
}

function toCandidate(row: CandidateRow): TaskMemorySearchCandidate {
  return {
    body: row.body,
    messageId: row.message_id,
    messageOrdinal: row.message_ordinal,
    messageRole: row.message_role,
    parentTaskId: row.parent_task_id,
    sessionId: row.session_id,
    sessionSourceUrl: row.session_source_url,
    sessionTitle: row.session_title,
    semanticSimilarity: row.semantic_similarity,
    sourceType: row.source_type,
    taskId: row.task_id,
    taskTitle: row.task_title,
    title: row.title,
    vectorId: row.vector_id
  };
}
