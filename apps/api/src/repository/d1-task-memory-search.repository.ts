import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import type {
  TaskMemoryIndexDocument,
  TaskMemoryIndexSource,
  TaskMemorySearchCandidate,
  TaskMemorySearchIndexStatus,
  TaskMemorySearchJob,
  TaskMemorySearchRepository
} from "../domain/task-memory-search.js";

export const HOSTED_TASK_MEMORY_EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";
const HOSTED_VECTOR_DIMENSIONS = 384;
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

type EmbeddingResponse = {
  readonly data: ReadonlyArray<readonly number[]>;
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

export type WorkersAiBinding = {
  readonly run: (
    model: string,
    input: { readonly text: readonly string[] }
  ) => Promise<EmbeddingResponse>;
};

export class WorkersAiTaskMemoryEmbeddings {
  public readonly model = HOSTED_TASK_MEMORY_EMBEDDING_MODEL;

  public constructor(private readonly ai: WorkersAiBinding | undefined) {}

  public async embed(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }
    if (this.ai == null) {
      throw new Error("Cloudflare Workers AI is not configured");
    }
    const response = await this.ai.run(this.model, { text: texts });
    return response.data.map((vector) => Float32Array.from(vector));
  }
}

export class D1TaskMemorySearchRepository
implements TaskMemorySearchRepository {
  public constructor(
    private readonly database: D1Database,
    private readonly vectorIndex: VectorizeIndex | undefined
  ) {}

  public async claimJobs(limit: number): Promise<readonly TaskMemorySearchJob[]> {
    const now = new Date();
    const leaseToken = crypto.randomUUID();
    const staleBefore = new Date(now.getTime() - JOB_LEASE_MS).toISOString();
    await this.database
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
      .bind(leaseToken, now.toISOString(), now.toISOString(), staleBefore, limit)
      .run();
    const rows = await this.database
      .prepare(
        `
          SELECT job_key, entity_type, entity_id, task_id, next_chunk,
            attempts, lease_token
          FROM task_memory_search_jobs
          WHERE lease_token = ?
          ORDER BY queued_at, job_key
        `
      )
      .bind(leaseToken)
      .all<JobRow>();
    return rows.results.map(toJob);
  }

  public async getSource(
    job: TaskMemorySearchJob
  ): Promise<TaskMemoryIndexSource | null> {
    if (job.entityType === "task") {
      const row = await this.database
        .prepare("SELECT id AS task_id, title AS task_title FROM tasks WHERE id = ?")
        .bind(job.entityId)
        .first<TaskSourceRow>();
      return row == null
        ? null
        : { taskId: row.task_id, taskTitle: row.task_title, type: "task_title" };
    }
    if (job.entityType === "session") {
      const row = await this.database
        .prepare(
          `
            SELECT s.id AS session_id, s.display_title AS session_title,
              t.id AS task_id, t.title AS task_title
            FROM task_sessions AS s
            JOIN tasks AS t ON t.id = s.task_id
            WHERE s.id = ?
          `
        )
        .bind(job.entityId)
        .first<SessionSourceRow>();
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
    const row = await this.database
      .prepare(
        `
          SELECT m.id AS message_id, m.ordinal AS message_ordinal,
            m.role AS message_role, m.text AS message_text,
            s.id AS session_id, s.display_title AS session_title,
            t.id AS task_id, t.title AS task_title
          FROM task_session_messages AS m
          JOIN task_sessions AS s ON s.id = m.session_id
          JOIN tasks AS t ON t.id = s.task_id
          WHERE m.id = ?
        `
      )
      .bind(job.entityId)
      .first<MessageSourceRow>();
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

  public async persistDocuments(
    documents: readonly TaskMemoryIndexDocument[],
    embeddings: readonly Float32Array[]
  ): Promise<void> {
    if (documents.length !== embeddings.length) {
      throw new Error("Each search document must have one embedding");
    }
    const vectors = documents.map((document, index) => {
      const embedding = embeddings[index];
      if (embedding?.length !== HOSTED_VECTOR_DIMENSIONS) {
        throw new Error("Hosted embedding dimension did not match the index");
      }
      return {
        id: document.vectorId,
        metadata: {
          sessionId: document.sessionId ?? "",
          sourceType: document.sourceType,
          taskId: document.taskId
        },
        values: Array.from(embedding)
      };
    });
    if (vectors.length > 0) {
      if (this.vectorIndex == null) {
        throw new Error("Cloudflare Vectorize is not configured");
      }
      await this.vectorIndex.upsert(vectors);
    }

    const statements = documents.map((document) =>
      this.database
        .prepare(
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
          `
        )
        .bind(
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
        )
    );
    if (statements.length > 0) {
      await this.database.batch(statements);
    }
  }

  public async completeJob(
    job: TaskMemorySearchJob,
    nextChunk: number | null
  ): Promise<void> {
    if (nextChunk == null) {
      await this.database
        .prepare(
          "DELETE FROM task_memory_search_jobs WHERE job_key = ? AND lease_token = ?"
        )
        .bind(job.key, job.leaseToken)
        .run();
      return;
    }
    await this.database
      .prepare(
        `
          UPDATE task_memory_search_jobs
          SET next_chunk = ?, lease_token = NULL, claimed_at = NULL
          WHERE job_key = ? AND lease_token = ?
        `
      )
      .bind(nextChunk, job.key, job.leaseToken)
      .run();
  }

  public async deleteSource(job: TaskMemorySearchJob): Promise<void> {
    const predicate = sourcePredicate(job);
    const rows = await this.database
      .prepare(
        `SELECT vector_id FROM task_memory_search_documents WHERE ${predicate.sql}`
      )
      .bind(...predicate.parameters)
      .all<{ vector_id: string }>();
    const vectorIds = rows.results.map((row) => row.vector_id);
    if (this.vectorIndex != null) {
      for (let offset = 0; offset < vectorIds.length; offset += 100) {
        const batch = vectorIds.slice(offset, offset + 100);
        if (batch.length > 0) {
          await this.vectorIndex.deleteByIds(batch);
        }
      }
    }
    await this.database
      .prepare(
        `DELETE FROM task_memory_search_documents WHERE ${predicate.sql}`
      )
      .bind(...predicate.parameters)
      .run();
  }

  public async failJob(job: TaskMemorySearchJob, retryAt: string): Promise<void> {
    await this.database
      .prepare(
        `
          UPDATE task_memory_search_jobs
          SET available_at = ?, lease_token = NULL, claimed_at = NULL,
            last_error = 'Semantic indexing failed; retry scheduled'
          WHERE job_key = ? AND lease_token = ?
        `
      )
      .bind(retryAt, job.key, job.leaseToken)
      .run();
  }

  public async lexicalSearch(
    expression: string,
    limit: number
  ): Promise<readonly TaskMemorySearchCandidate[]> {
    const result = await this.database
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
      .bind(expression, limit)
      .all<CandidateRow>();
    return result.results.map(toCandidate);
  }

  public async vectorSearch(
    embedding: Float32Array,
    limit: number
  ): Promise<readonly TaskMemorySearchCandidate[]> {
    if (this.vectorIndex == null) {
      throw new Error("Cloudflare Vectorize is not configured");
    }
    const result = await this.vectorIndex.query(Array.from(embedding), {
      returnMetadata: false,
      topK: limit
    });
    const ids = result.matches.map((match) => match.id);
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await this.database
      .prepare(
        `
          SELECT d.vector_id, d.source_type, d.task_id,
            t.parent_task_id, t.title AS task_title, d.session_id,
            s.display_title AS session_title, s.source_url AS session_source_url,
            d.message_id,
            d.role AS message_role, d.ordinal AS message_ordinal,
            d.title, d.body, NULL AS semantic_similarity
          FROM task_memory_search_documents AS d
          JOIN tasks AS t ON t.id = d.task_id
          LEFT JOIN task_sessions AS s ON s.id = d.session_id
          WHERE d.vector_id IN (${placeholders})
        `
      )
      .bind(...ids)
      .all<CandidateRow>();
    const similarityById = new Map(
      result.matches.map((match) => [match.id, match.score])
    );
    const byId = new Map(
      rows.results.map((row) => {
        const candidate = toCandidate(row);
        return [
          row.vector_id,
          {
            ...candidate,
            semanticSimilarity: similarityById.get(row.vector_id) ?? null
          }
        ];
      })
    );
    return ids.flatMap((id) => {
      const candidate = byId.get(id);
      return candidate == null ? [] : [candidate];
    });
  }

  public async getIndexStatus(): Promise<TaskMemorySearchIndexStatus> {
    const row = await this.database
      .prepare(
        `
          SELECT
            (SELECT count(*) FROM task_memory_search_documents) AS indexed_documents,
            (SELECT count(*) FROM task_memory_search_jobs) AS pending_jobs
        `
      )
      .first<{ indexed_documents: number; pending_jobs: number }>();
    return {
      indexedDocuments: row?.indexed_documents ?? 0,
      pendingJobs: row?.pending_jobs ?? 0
    };
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
    semanticSimilarity: row.semantic_similarity,
    sessionId: row.session_id,
    sessionSourceUrl: row.session_source_url,
    sessionTitle: row.session_title,
    sourceType: row.source_type,
    taskId: row.task_id,
    taskTitle: row.task_title,
    title: row.title,
    vectorId: row.vector_id
  };
}
