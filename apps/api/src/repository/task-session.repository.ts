import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskSessionRow } from "../db/schema.js";
import type {
  AgentProvider,
  CreateTaskSessionInput,
  TaskSession,
  TaskSessionId
} from "../domain/task-session.js";
import type { TaskId } from "../domain/task.js";
import type { TranscriptEntry } from "../domain/transcript-entry.js";

function normalizeSessionTitle(title: string | null | undefined): string {
  const trimmed = title?.trim();
  return trimmed == null || trimmed.length === 0 ? "New Session" : trimmed;
}

function nullableIsoDate(value: Date | null): string | null {
  return value == null ? null : value.toISOString();
}

function serializeMetadata(value: Record<string, unknown> | null | undefined): string | null {
  return value == null ? null : JSON.stringify(value);
}

export type TaskSessionRepository = {
  readonly createForTask: (
    taskId: TaskId,
    input: CreateTaskSessionInput
  ) => Promise<TaskSession>;
  readonly clearPendingForkSessionToken: (
    sessionId: TaskSessionId
  ) => Promise<TaskSession | null>;
  readonly findById: (sessionId: TaskSessionId) => Promise<TaskSession | null>;
  readonly listByTaskId: (taskId: TaskId) => Promise<readonly TaskSession[]>;
  readonly recordTranscriptEntry: (
    sessionId: TaskSessionId,
    entry: TranscriptEntry
  ) => Promise<TaskSession | null>;
  readonly recordTurnCancelled: (
    sessionId: TaskSessionId
  ) => Promise<TaskSession | null>;
  readonly recordTurnFailed: (
    sessionId: TaskSessionId
  ) => Promise<TaskSession | null>;
  readonly recordTurnFinished: (
    sessionId: TaskSessionId
  ) => Promise<TaskSession | null>;
  readonly recordTurnStarted: (
    sessionId: TaskSessionId,
    input: RecordTurnStartedInput
  ) => Promise<TaskSession | null>;
  readonly setRunning: (sessionId: TaskSessionId) => Promise<TaskSession | null>;
  readonly setSessionToken: (
    sessionId: TaskSessionId,
    token: string
  ) => Promise<TaskSession | null>;
};

export type RecordTurnStartedInput = {
  readonly model?: string;
  readonly planMode: boolean;
  readonly status: Extract<TaskSession["status"], "running" | "starting">;
};

export class SqliteTaskSessionRepository implements TaskSessionRepository {
  public constructor(private readonly db: Kysely<Database>) {}

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
        local_path: input.localPath ?? "",
        metadata_json: serializeMetadata(input.metadata),
        model: input.model ?? null,
        plan_mode: input.planMode === true ? 1 : 0,
        provider: input.provider,
        provider_id: input.providerId ?? null,
        status: "idle",
        task_id: taskId,
        title: normalizeSessionTitle(input.title),
        transcript_path: input.transcriptPath ?? null,
        updated_at: now.toISOString()
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTaskSession(row);
  }

  public async clearPendingForkSessionToken(
    sessionId: TaskSessionId
  ): Promise<TaskSession | null> {
    return this.updateSession(sessionId, {
      pending_fork_session_token: null,
      updated_at: new Date().toISOString()
    });
  }

  public async findById(sessionId: TaskSessionId): Promise<TaskSession | null> {
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

  public async recordTranscriptEntry(
    sessionId: TaskSessionId,
    entry: TranscriptEntry
  ): Promise<TaskSession | null> {
    return this.updateSession(sessionId, {
      ...(entry.kind === "user_prompt"
        ? { last_message_at: new Date(entry.createdAt).toISOString() }
        : {}),
      updated_at: new Date().toISOString()
    });
  }

  public async recordTurnCancelled(
    sessionId: TaskSessionId
  ): Promise<TaskSession | null> {
    return this.updateSession(sessionId, {
      last_turn_outcome: "cancelled",
      status: "idle",
      updated_at: new Date().toISOString()
    });
  }

  public async recordTurnFailed(
    sessionId: TaskSessionId
  ): Promise<TaskSession | null> {
    return this.updateSession(sessionId, {
      last_turn_outcome: "failed",
      status: "failed",
      updated_at: new Date().toISOString()
    });
  }

  public async recordTurnFinished(
    sessionId: TaskSessionId
  ): Promise<TaskSession | null> {
    return this.updateSession(sessionId, {
      last_turn_outcome: "success",
      status: "idle",
      updated_at: new Date().toISOString()
    });
  }

  public async recordTurnStarted(
    sessionId: TaskSessionId,
    input: RecordTurnStartedInput
  ): Promise<TaskSession | null> {
    return this.updateSession(sessionId, {
      last_turn_outcome: null,
      model: input.model ?? null,
      plan_mode: input.planMode ? 1 : 0,
      status: input.status,
      updated_at: new Date().toISOString()
    });
  }

  public async setRunning(sessionId: TaskSessionId): Promise<TaskSession | null> {
    return this.updateSession(sessionId, {
      status: "running",
      updated_at: new Date().toISOString()
    });
  }

  public async setSessionToken(
    sessionId: TaskSessionId,
    token: string
  ): Promise<TaskSession | null> {
    return this.updateSession(sessionId, {
      session_token: token,
      updated_at: new Date().toISOString()
    });
  }

  private async updateSession(
    sessionId: TaskSessionId,
    values: Partial<{
      readonly last_message_at: string | null;
      readonly last_turn_outcome: string | null;
      readonly model: string | null;
      readonly pending_fork_session_token: string | null;
      readonly plan_mode: number;
      readonly session_token: string | null;
      readonly status: string;
      readonly updated_at: string;
    }>
  ): Promise<TaskSession | null> {
    const row = await this.db
      .updateTable("task_sessions")
      .set(values)
      .where("id", "=", sessionId)
      .returningAll()
      .executeTakeFirst();

    return row == null ? null : toTaskSession(row);
  }
}

function toTaskSession(row: TaskSessionRow): TaskSession {
  return {
    actionId: row.action_id,
    claimedAt: row.claimed_at == null ? null : new Date(row.claimed_at),
    createdAt: new Date(row.created_at),
    id: row.id,
    lastMessageAt: row.last_message_at == null ? null : new Date(row.last_message_at),
    lastTurnOutcome: row.last_turn_outcome as TaskSession["lastTurnOutcome"],
    localPath: row.local_path,
    metadata: parseMetadata(row.metadata_json),
    model: row.model,
    pendingForkSessionToken: row.pending_fork_session_token,
    planMode: row.plan_mode === 1,
    provider: row.provider as AgentProvider,
    providerId: row.provider_id,
    sessionToken: row.session_token,
    status: row.status as TaskSession["status"],
    taskId: row.task_id,
    title: row.title,
    transcriptPath: row.transcript_path,
    updatedAt: new Date(row.updated_at)
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
