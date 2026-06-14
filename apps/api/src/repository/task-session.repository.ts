import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskSessionRow } from "../db/schema.js";
import type {
  AgentProvider,
  CreateTaskSessionInput,
  TaskSession
} from "../domain/task-session.js";
import type { TaskId } from "../domain/task.js";

export type TaskSessionRepository = {
  readonly createForTask: (
    taskId: TaskId,
    input: CreateTaskSessionInput
  ) => Promise<TaskSession>;
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
        provider: input.provider,
        task_id: taskId
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTaskSession(row);
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
    provider: row.provider as AgentProvider,
    taskId: row.task_id
  };
}
