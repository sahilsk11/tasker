import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskSessionRow } from "../db/schema.js";
import type {
  AgentProvider,
  CreateTaskSessionInput,
  TaskSession
} from "../domain/task-session.js";
import type { TaskId } from "../domain/task.js";

function normalizeSessionTitle(title: string | null | undefined): string {
  const trimmed = title?.trim();
  return trimmed == null || trimmed.length === 0 ? "New Session" : trimmed;
}

export type TaskSessionRepository = {
  readonly createForTask: (
    taskId: TaskId,
    input: CreateTaskSessionInput
  ) => Promise<TaskSession>;
  readonly findById: (sessionId: TaskSession["id"]) => Promise<TaskSession | null>;
  readonly listByTaskId: (taskId: TaskId) => Promise<readonly TaskSession[]>;
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

  public async findById(sessionId: TaskSession["id"]): Promise<TaskSession | null> {
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
