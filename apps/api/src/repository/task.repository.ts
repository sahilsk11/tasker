import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskRow } from "../db/schema.js";
import type { CreateTaskInput, Task, TaskId } from "../domain/task.js";

export type TaskRepository = {
  readonly create: (input: CreateTaskInput) => Promise<Task>;
  readonly findById: (id: TaskId) => Promise<Task | null>;
  readonly findChildren: (parentTaskId: TaskId) => Promise<readonly Task[]>;
};

export class SqliteTaskRepository implements TaskRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async create(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const row = await this.db
      .insertInto("tasks")
      .values({
        created_at: now,
        description: input.description,
        id: randomUUID(),
        parent_task_id: input.parentTaskId,
        title: input.title,
        updated_at: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTask(row);
  }

  public async findById(id: TaskId): Promise<Task | null> {
    const row = await this.db
      .selectFrom("tasks")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row == null ? null : toTask(row);
  }

  public async findChildren(parentTaskId: TaskId): Promise<readonly Task[]> {
    const rows = await this.db
      .selectFrom("tasks")
      .selectAll()
      .where("parent_task_id", "=", parentTaskId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map(toTask);
  }
}

function toTask(row: TaskRow): Task {
  return {
    createdAt: new Date(row.created_at),
    description: row.description,
    id: row.id,
    parentTaskId: row.parent_task_id,
    title: row.title,
    updatedAt: new Date(row.updated_at)
  };
}
