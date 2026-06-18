import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskWorktreeRow } from "../db/schema.js";
import type {
  CreateTaskWorktreeInput,
  TaskWorktree
} from "../domain/task-worktree.js";
import type { TaskId } from "../domain/task.js";

export type TaskWorktreeRepository = {
  readonly createForTask: (
    taskId: TaskId,
    input: CreateTaskWorktreeInput
  ) => Promise<TaskWorktree>;
  readonly listByTaskId: (taskId: TaskId) => Promise<readonly TaskWorktree[]>;
};

export class SqliteTaskWorktreeRepository implements TaskWorktreeRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async createForTask(
    taskId: TaskId,
    input: CreateTaskWorktreeInput
  ): Promise<TaskWorktree> {
    const row = await this.db
      .insertInto("task_worktrees")
      .values({
        created_at: new Date().toISOString(),
        created_by_session_id: input.createdBySessionId ?? null,
        id: randomUUID(),
        path: input.path,
        task_id: taskId
      })
      .onConflict((oc) => oc.columns(["task_id", "path"]).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (row == null) {
      return this.findByTaskIdAndPath(taskId, input.path);
    }

    return toTaskWorktree(row);
  }

  public async listByTaskId(taskId: TaskId): Promise<readonly TaskWorktree[]> {
    const rows = await this.db
      .selectFrom("task_worktrees")
      .selectAll()
      .where("task_id", "=", taskId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map(toTaskWorktree);
  }

  private async findByTaskIdAndPath(
    taskId: TaskId,
    path: string
  ): Promise<TaskWorktree> {
    const row = await this.db
      .selectFrom("task_worktrees")
      .selectAll()
      .where("task_id", "=", taskId)
      .where("path", "=", path)
      .executeTakeFirstOrThrow();

    return toTaskWorktree(row);
  }
}

function toTaskWorktree(row: TaskWorktreeRow): TaskWorktree {
  return {
    createdAt: new Date(row.created_at),
    createdBySessionId: row.created_by_session_id,
    id: row.id,
    path: row.path,
    taskId: row.task_id
  };
}
