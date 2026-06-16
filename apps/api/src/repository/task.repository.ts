import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskRow } from "../db/schema.js";
import type {
  CreateTaskInput,
  Task,
  TaskId,
  TaskState,
  UpdateTaskInput
} from "../domain/task.js";

export type TaskRepository = {
  readonly create: (input: CreateTaskInput) => Promise<Task>;
  readonly findById: (id: TaskId) => Promise<Task | null>;
  readonly findChildren: (parentTaskId: TaskId) => Promise<readonly Task[]>;
  readonly list: () => Promise<readonly Task[]>;
  readonly updateStateAtLeast: (id: TaskId, state: TaskState) => Promise<Task | null>;
  readonly update: (id: TaskId, input: UpdateTaskInput) => Promise<Task | null>;
};

const taskStateRank: Record<TaskState, number> = {
  code_review: 4,
  done: 6,
  implement: 3,
  merged: 5,
  plan: 2,
  ready: 0,
  research: 1
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

  public async list(): Promise<readonly Task[]> {
    const rows = await this.db
      .selectFrom("tasks")
      .selectAll()
      .orderBy("created_at", "desc")
      .execute();

    return rows.map(toTask);
  }

  public async update(id: TaskId, input: UpdateTaskInput): Promise<Task | null> {
    const values: {
      readonly description?: string | null;
      readonly parent_task_id?: string | null;
      readonly title?: string;
      readonly updated_at: string;
    } = {
      updated_at: new Date().toISOString()
    };

    const row = await this.db
      .updateTable("tasks")
      .set({
        ...values,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.parentTaskId !== undefined ? { parent_task_id: input.parentTaskId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {})
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    return row == null ? null : toTask(row);
  }

  public async updateStateAtLeast(
    id: TaskId,
    state: TaskState
  ): Promise<Task | null> {
    const task = await this.findById(id);
    if (task == null) {
      return null;
    }

    if (taskStateRank[task.state] >= taskStateRank[state]) {
      return task;
    }

    const row = await this.db
      .updateTable("tasks")
      .set({
        state,
        updated_at: new Date().toISOString()
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    return row == null ? null : toTask(row);
  }
}

function toTask(row: TaskRow): Task {
  return {
    createdAt: new Date(row.created_at),
    description: row.description,
    id: row.id,
    parentTaskId: row.parent_task_id,
    state: row.state,
    title: row.title,
    updatedAt: new Date(row.updated_at)
  };
}
