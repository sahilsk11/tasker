import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskSessionRow } from "../db/schema.js";
import type {
  ClaimTaskSessionInput,
  CreateTaskSessionInput,
  TaskSession
} from "../domain/task-session.js";
import type { TaskId } from "../domain/task.js";

function nullableIsoDate(value: Date | null): string | null {
  return value == null ? null : value.toISOString();
}

function serializeMetadata(value: Record<string, unknown> | null | undefined): string | null {
  return value == null ? null : JSON.stringify(value);
}

export type TaskSessionRepository = {
  readonly claim: (
    sessionId: string,
    input: ClaimTaskSessionInput
  ) => Promise<TaskSession | null>;
  readonly createForTask: (
    taskId: TaskId,
    input: CreateTaskSessionInput
  ) => Promise<TaskSession>;
  readonly findById: (sessionId: string) => Promise<TaskSession | null>;
  readonly listByTaskId: (taskId: TaskId) => Promise<readonly TaskSession[]>;
};

export class SqliteTaskSessionRepository implements TaskSessionRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async claim(
    sessionId: string,
    input: ClaimTaskSessionInput
  ): Promise<TaskSession | null> {
    const values: Partial<{
      claimed_at: string;
      metadata_json: string | null;
      provider: string;
      provider_id: string | null;
      transcript_path: string | null;
    }> = {
      claimed_at: new Date().toISOString()
    };

    if (input.metadata !== undefined) {
      values.metadata_json = serializeMetadata(input.metadata);
    }
    if (input.provider != null) {
      values.provider = input.provider;
    }
    if (input.providerId !== undefined) {
      values.provider_id = input.providerId;
    }
    if (input.transcriptPath !== undefined) {
      values.transcript_path = input.transcriptPath;
    }

    const row = await this.db
      .updateTable("task_sessions")
      .set(values)
      .where("id", "=", sessionId)
      .where("claimed_at", "is", null)
      .returningAll()
      .executeTakeFirst();

    return row == null ? null : toTaskSession(row);
  }

  public async createForTask(
    taskId: TaskId,
    input: CreateTaskSessionInput
  ): Promise<TaskSession> {
    const now = new Date();
    const claimedAt = input.claimedAt === undefined ? now : input.claimedAt;
    const row = await this.db
      .insertInto("task_sessions")
      .values({
        action_id: input.actionId ?? null,
        claimed_at: nullableIsoDate(claimedAt),
        created_at: now.toISOString(),
        id: randomUUID(),
        metadata_json: serializeMetadata(input.metadata),
        provider: input.provider,
        provider_id: input.providerId ?? null,
        task_id: taskId,
        transcript_path: input.transcriptPath ?? null
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTaskSession(row);
  }

  public async findById(sessionId: string): Promise<TaskSession | null> {
    const row = await this.db
      .selectFrom("task_sessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirst();

    return row == null ? null : toTaskSession(row);
  }

  public async listByTaskId(taskId: TaskId): Promise<readonly TaskSession[]> {
    const rows = await this.db
      .selectFrom("task_sessions")
      .selectAll()
      .where("task_id", "=", taskId)
      .where("claimed_at", "is not", null)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map(toTaskSession);
  }
}

function toTaskSession(row: TaskSessionRow): TaskSession {
  return {
    actionId: row.action_id,
    claimedAt: row.claimed_at == null ? null : new Date(row.claimed_at),
    createdAt: new Date(row.created_at),
    displayTitle: null,
    id: row.id,
    metadata: parseMetadata(row.metadata_json),
    provider: row.provider,
    providerId: row.provider_id,
    taskId: row.task_id,
    transcriptPath: row.transcript_path
  };
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }

  const parsed = JSON.parse(value) as unknown;
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}
