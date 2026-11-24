import type { D1Database } from "@cloudflare/workers-types";
import { randomUUID } from "node:crypto";
import type { Insertable, Kysely, Transaction } from "kysely";
import { DEFAULT_SESSION_MESSAGES_LIMIT } from "../command/task-session-message.command.js";
import type {
  Database,
  TaskSessionMessageRow,
  TaskSessionMessagesTable
} from "../db/schema.js";
import type {
  ListTaskSessionMessagesOptions,
  PreparedTaskSessionMessage,
  TaskSessionMessage,
  TaskSessionMessagesHead,
  TaskSessionMessagesPage
} from "../domain/task-session-message.js";
import type { TaskSessionId } from "../domain/task-session.js";

// D1 enforces a maximum of 100 bound parameters per statement and ~2MB per row.
// Lookup queries bind 1 session_id + up to 99 external_ids = 100 params.
const D1_LOOKUP_CHUNK_SIZE = 99;
// Insert statements bind 9 columns per row: 10 rows * 9 = 90 params <= 100.
const D1_INSERT_MAX_ROWS_PER_STATEMENT = 10;
// Keep multi-row insert payload sizes conservative for D1 while allowing any single valid row.
const D1_INSERT_MAX_BYTES_PER_STATEMENT = 1_000_000;

const utf8Encoder = new TextEncoder();

export type AppendSessionMessagesOptions = {
  readonly inBatchConflictIds?: readonly string[];
  readonly inBatchSkipped?: number;
};

export type AppendSessionMessagesResult =
  | {
      readonly inserted: number;
      readonly kind: "appended";
      readonly skipped: number;
      readonly total: number;
    }
  | {
      readonly conflictingExternalIds: readonly string[];
      readonly kind: "conflict";
    };

export type TaskSessionMessageRepository = {
  readonly appendBatch: (
    sessionId: TaskSessionId,
    messages: readonly PreparedTaskSessionMessage[],
    options?: AppendSessionMessagesOptions
  ) => Promise<AppendSessionMessagesResult>;
  readonly getHead: (sessionId: TaskSessionId) => Promise<TaskSessionMessagesHead>;
  readonly listBySessionId: (
    sessionId: TaskSessionId,
    options?: ListTaskSessionMessagesOptions
  ) => Promise<TaskSessionMessagesPage>;
};

export type SqliteTaskSessionMessageRepositoryOptions = {
  readonly d1?: D1Database;
};

export class SqliteTaskSessionMessageRepository
  implements TaskSessionMessageRepository
{
  private readonly d1: D1Database | undefined;

  public constructor(
    private readonly db: Kysely<Database>,
    options?: SqliteTaskSessionMessageRepositoryOptions
  ) {
    this.d1 = options?.d1;
  }

  public async appendBatch(
    sessionId: TaskSessionId,
    messages: readonly PreparedTaskSessionMessage[],
    options: AppendSessionMessagesOptions = {}
  ): Promise<AppendSessionMessagesResult> {
    const inBatchConflictIds = options.inBatchConflictIds ?? [];
    const inBatchSkipped = options.inBatchSkipped ?? 0;

    if (this.d1 != null) {
      return this.appendBatchWithD1(
        this.d1,
        sessionId,
        messages,
        inBatchConflictIds,
        inBatchSkipped
      );
    }

    return this.db.transaction().execute(async (trx) => {
      const existingHashes = await findExistingHashes(
        trx,
        sessionId,
        messages.map((message) => message.externalId)
      );
      const plan = classifyMessages(messages, existingHashes, inBatchConflictIds);
      if (plan.conflictingExternalIds.length > 0) {
        return {
          conflictingExternalIds: plan.conflictingExternalIds,
          kind: "conflict" as const
        };
      }

      const now = new Date().toISOString();
      const rowsToInsert = plan.toInsert.map((message) =>
        toInsertRow(sessionId, message, now)
      );

      for (const chunk of chunkRowsForInsert(rowsToInsert)) {
        await trx.insertInto("task_session_messages").values(chunk).execute();
      }

      const total = await countBySession(trx, sessionId);
      return {
        inserted: rowsToInsert.length,
        kind: "appended" as const,
        skipped: plan.skippedCount + inBatchSkipped,
        total
      };
    });
  }

  public async getHead(sessionId: TaskSessionId): Promise<TaskSessionMessagesHead> {
    const [count, latestRow] = await Promise.all([
      countBySession(this.db, sessionId),
      this.db
        .selectFrom("task_session_messages")
        .select(["external_id", "ordinal"])
        .where("session_id", "=", sessionId)
        .orderBy("ordinal", "desc")
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst()
    ]);

    if (count === 0 || latestRow == null) {
      return {
        count: 0,
        lastExternalId: null,
        lastOrdinal: null
      };
    }

    return {
      count,
      lastExternalId: latestRow.external_id,
      lastOrdinal: latestRow.ordinal
    };
  }

  public async listBySessionId(
    sessionId: TaskSessionId,
    options: ListTaskSessionMessagesOptions = {}
  ): Promise<TaskSessionMessagesPage> {
    const limit = options.limit ?? DEFAULT_SESSION_MESSAGES_LIMIT;
    let query = this.db
      .selectFrom("task_session_messages")
      .selectAll()
      .where("session_id", "=", sessionId);

    if (options.after !== undefined) {
      query = query.where("ordinal", ">", options.after);
    }

    const rows = await query
      .orderBy("ordinal", "asc")
      .orderBy("created_at", "asc")
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows.at(-1);

    return {
      messages: pageRows.map(toTaskSessionMessage),
      nextAfter: hasMore && lastRow != null ? lastRow.ordinal : null
    };
  }

  private async appendBatchWithD1(
    d1: D1Database,
    sessionId: TaskSessionId,
    messages: readonly PreparedTaskSessionMessage[],
    inBatchConflictIds: readonly string[],
    inBatchSkipped: number
  ): Promise<AppendSessionMessagesResult> {
    const externalIds = messages.map((message) => message.externalId);
    const existingHashes = await findExistingHashes(this.db, sessionId, externalIds);
    const plan = classifyMessages(messages, existingHashes, inBatchConflictIds);

    if (plan.conflictingExternalIds.length > 0) {
      return {
        conflictingExternalIds: plan.conflictingExternalIds,
        kind: "conflict"
      };
    }

    if (plan.toInsert.length === 0) {
      const total = await countBySession(this.db, sessionId);
      return {
        inserted: 0,
        kind: "appended",
        skipped: plan.skippedCount + inBatchSkipped,
        total
      };
    }

    try {
      const total = await this.executeD1InsertBatch(d1, sessionId, plan.toInsert);
      return {
        inserted: plan.toInsert.length,
        kind: "appended",
        skipped: plan.skippedCount + inBatchSkipped,
        total
      };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      // D1 rolls back the entire batch on error. Re-read to surface conflicts or retry remaining rows.
      const refreshedHashes = await findExistingHashes(this.db, sessionId, externalIds);
      const retryPlan = classifyMessages(messages, refreshedHashes, inBatchConflictIds);
      if (retryPlan.conflictingExternalIds.length > 0) {
        return {
          conflictingExternalIds: retryPlan.conflictingExternalIds,
          kind: "conflict"
        };
      }

      if (retryPlan.toInsert.length === 0) {
        const total = await countBySession(this.db, sessionId);
        return {
          inserted: 0,
          kind: "appended",
          skipped: retryPlan.skippedCount + inBatchSkipped,
          total
        };
      }

      const total = await this.executeD1InsertBatch(d1, sessionId, retryPlan.toInsert);
      return {
        inserted: retryPlan.toInsert.length,
        kind: "appended",
        skipped: retryPlan.skippedCount + inBatchSkipped,
        total
      };
    }
  }

  private async executeD1InsertBatch(
    d1: D1Database,
    sessionId: TaskSessionId,
    toInsert: readonly PreparedTaskSessionMessage[]
  ): Promise<number> {
    const now = new Date().toISOString();
    const rowsToInsert = toInsert.map((message) =>
      toInsertRow(sessionId, message, now)
    );
    const compiledInserts = chunkRowsForInsert(rowsToInsert).map((chunk) =>
      this.db.insertInto("task_session_messages").values(chunk).compile()
    );
    const compiledCount = this.db
      .selectFrom("task_session_messages")
      .select((eb) => eb.fn.countAll<number | string>().as("count"))
      .where("session_id", "=", sessionId)
      .compile();

    const statements = [...compiledInserts, compiledCount].map((compiled) =>
      d1.prepare(compiled.sql).bind(...compiled.parameters)
    );
    const results = await d1.batch<{ readonly count?: number | string }>(statements);
    const countRow = results.at(-1)?.results[0];
    return Number(countRow?.count ?? 0);
  }
}

async function findExistingHashes(
  executor: Kysely<Database> | Transaction<Database>,
  sessionId: TaskSessionId,
  externalIds: readonly string[]
): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  if (externalIds.length === 0) {
    return existing;
  }

  for (let offset = 0; offset < externalIds.length; offset += D1_LOOKUP_CHUNK_SIZE) {
    const chunk = externalIds.slice(offset, offset + D1_LOOKUP_CHUNK_SIZE);
    const rows = await executor
      .selectFrom("task_session_messages")
      .select(["content_hash", "external_id"])
      .where("session_id", "=", sessionId)
      .where("external_id", "in", chunk)
      .execute();

    for (const row of rows) {
      existing.set(row.external_id, row.content_hash);
    }
  }

  return existing;
}

async function countBySession(
  executor: Kysely<Database> | Transaction<Database>,
  sessionId: TaskSessionId
): Promise<number> {
  const row = await executor
    .selectFrom("task_session_messages")
    .select((eb) => eb.fn.countAll<number | string>().as("count"))
    .where("session_id", "=", sessionId)
    .executeTakeFirstOrThrow();

  return Number(row.count);
}

function classifyMessages(
  messages: readonly PreparedTaskSessionMessage[],
  existingHashes: ReadonlyMap<string, string>,
  inBatchConflictIds: readonly string[]
): {
  readonly conflictingExternalIds: readonly string[];
  readonly skippedCount: number;
  readonly toInsert: readonly PreparedTaskSessionMessage[];
} {
  const conflictSet = new Set<string>(inBatchConflictIds);
  const toInsert: PreparedTaskSessionMessage[] = [];
  let skippedCount = 0;

  for (const message of messages) {
    const existingHash = existingHashes.get(message.externalId);
    if (existingHash !== undefined) {
      if (existingHash !== message.contentHash) {
        conflictSet.add(message.externalId);
      } else {
        skippedCount += 1;
      }
      continue;
    }

    if (!conflictSet.has(message.externalId)) {
      toInsert.push(message);
    }
  }

  return {
    conflictingExternalIds: [...conflictSet],
    skippedCount,
    toInsert
  };
}

function toInsertRow(
  sessionId: TaskSessionId,
  message: PreparedTaskSessionMessage,
  createdAt: string
): Insertable<TaskSessionMessagesTable> {
  return {
    content_hash: message.contentHash,
    created_at: createdAt,
    external_id: message.externalId,
    id: randomUUID(),
    occurred_at: message.occurredAt,
    ordinal: message.ordinal,
    role: message.role,
    session_id: sessionId,
    text: message.text
  };
}

function chunkRowsForInsert(
  rows: ReadonlyArray<Insertable<TaskSessionMessagesTable>>
): ReadonlyArray<ReadonlyArray<Insertable<TaskSessionMessagesTable>>> {
  const chunks: Array<Array<Insertable<TaskSessionMessagesTable>>> = [];
  let currentChunk: Array<Insertable<TaskSessionMessagesTable>> = [];
  let currentBytes = 0;

  for (const row of rows) {
    const rowBytes = utf8Encoder.encode(row.text).byteLength;
    const exceedsRowLimit = currentChunk.length >= D1_INSERT_MAX_ROWS_PER_STATEMENT;
    const exceedsByteLimit =
      currentChunk.length > 0 && currentBytes + rowBytes > D1_INSERT_MAX_BYTES_PER_STATEMENT;

    if (exceedsRowLimit || exceedsByteLimit) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = 0;
    }

    currentChunk.push(row);
    currentBytes += rowBytes;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/iu.test(error.message);
}

function toTaskSessionMessage(row: TaskSessionMessageRow): TaskSessionMessage {
  return {
    contentHash: row.content_hash,
    createdAt: new Date(row.created_at),
    externalId: row.external_id,
    id: row.id,
    occurredAt: row.occurred_at == null ? null : new Date(row.occurred_at),
    ordinal: row.ordinal,
    role: row.role,
    sessionId: row.session_id,
    text: row.text
  };
}
