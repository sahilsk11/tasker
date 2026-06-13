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
    const row = await this.db
      .insertInto("task_sessions")
      .values({
        created_at: new Date().toISOString(),
        id: randomUUID(),
        local_path: input.localPath ?? "",
        model: input.model ?? null,
        plan_mode: input.planMode === true ? 1 : 0,
        provider: input.provider,
        status: "idle",
        task_id: taskId,
        title: normalizeSessionTitle(input.title),
        updated_at: new Date().toISOString()
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
    createdAt: new Date(row.created_at),
    id: row.id,
    lastMessageAt: row.last_message_at == null ? null : new Date(row.last_message_at),
    lastTurnOutcome: row.last_turn_outcome as TaskSession["lastTurnOutcome"],
    localPath: row.local_path,
    model: row.model,
    pendingForkSessionToken: row.pending_fork_session_token,
    planMode: row.plan_mode === 1,
    provider: row.provider as AgentProvider,
    sessionToken: row.session_token,
    status: row.status as TaskSession["status"],
    taskId: row.task_id,
    title: row.title,
    updatedAt: new Date(row.updated_at)
  };
}
