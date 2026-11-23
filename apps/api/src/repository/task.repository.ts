import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskRow } from "../db/schema.js";
import type {
  CreateTaskInput,
  Task,
  TaskDependencySummary,
  TaskId,
  UpdateTaskInput
} from "../domain/task.js";

export type TaskRepository = {
  readonly create: (input: CreateTaskInput) => Promise<Task>;
  readonly createSubtasks: (input: CreateSubtasksInput) => Promise<readonly Task[]>;
  readonly findById: (id: TaskId) => Promise<Task | null>;
  readonly findChildren: (parentTaskId: TaskId) => Promise<readonly Task[]>;
  readonly listDependenciesByTaskIds: (
    taskIds: readonly TaskId[]
  ) => Promise<readonly TaskDependencyList[]>;
  readonly listByParentTaskId: (parentTaskId: TaskId | null) => Promise<readonly Task[]>;
  readonly update: (id: TaskId, input: UpdateTaskInput) => Promise<Task | null>;
};

export type TaskDependencyList = {
  readonly taskId: TaskId;
  readonly dependencies: readonly TaskDependencySummary[];
};

export type CreateSubtaskInput = {
  readonly dependsOn: readonly string[];
  readonly description: string | null;
  readonly id: string;
  readonly title: string;
};

export type CreateSubtasksInput = {
  readonly parentTaskId: TaskId;
  readonly subtasks: readonly CreateSubtaskInput[];
  readonly workingDirectory?: string | null;
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
        updated_at: now,
        working_directory: input.workingDirectory ?? null
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTask(row);
  }

  public async createSubtasks(input: CreateSubtasksInput): Promise<readonly Task[]> {
    return this.db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      const taskIdsByInputId = new Map<string, TaskId>();
      const rows: TaskRow[] = [];

      for (const subtask of input.subtasks) {
        const id = randomUUID();
        taskIdsByInputId.set(subtask.id, id);
        rows.push(
          await trx
            .insertInto("tasks")
            .values({
              created_at: now,
              description: subtask.description,
              id,
              parent_task_id: input.parentTaskId,
              title: subtask.title,
              updated_at: now,
              working_directory: input.workingDirectory ?? null
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        );
      }

      const dependencyRows = input.subtasks.flatMap((subtask) => {
        const taskId = taskIdsByInputId.get(subtask.id);
        if (taskId == null) {
          return [];
        }

        return subtask.dependsOn.map((dependencyId) => {
          const dependsOnTaskId = taskIdsByInputId.get(dependencyId);
          if (dependsOnTaskId == null) {
            throw new Error(`Dependency ${dependencyId} was not created.`);
          }

          return {
            created_at: now,
            depends_on_task_id: dependsOnTaskId,
            task_id: taskId
          };
        });
      });

      if (dependencyRows.length > 0) {
        await trx.insertInto("task_dependencies").values(dependencyRows).execute();
      }

      return rows.map(toTask);
    });
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

  public async listByParentTaskId(
    parentTaskId: TaskId | null
  ): Promise<readonly Task[]> {
    const query = this.db
      .selectFrom("tasks")
      .selectAll()
      .orderBy("created_at", "desc");

    const rows =
      parentTaskId == null
        ? await query.where("parent_task_id", "is", null).execute()
        : await query.where("parent_task_id", "=", parentTaskId).execute();

    return rows.map(toTask);
  }

  public async listDependenciesByTaskIds(
    taskIds: readonly TaskId[]
  ): Promise<readonly TaskDependencyList[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const query = this.db
      .selectFrom("task_dependencies")
      .innerJoin(
        "tasks as dependency",
        "dependency.id",
        "task_dependencies.depends_on_task_id"
      )
      .select([
        "task_dependencies.task_id as taskId",
        "dependency.id as id",
        "dependency.title as title"
      ])
      .orderBy("dependency.created_at", "asc");

    const batchSize = 100;
    const batches = [];
    for (let offset = 0; offset < taskIds.length; offset += batchSize) {
      batches.push(await query
        .where("task_dependencies.task_id", "in", taskIds.slice(offset, offset + batchSize))
        .execute());
    }
    const rows = batches.flat();

    const dependenciesByTaskId = new Map<TaskId, TaskDependencySummary[]>();
    rows.forEach((row) => {
      const dependencies = dependenciesByTaskId.get(row.taskId) ?? [];
      dependencies.push({
        id: row.id,
        title: row.title
      });
      dependenciesByTaskId.set(row.taskId, dependencies);
    });

    return taskIds.map((taskId) => ({
      taskId,
      dependencies: dependenciesByTaskId.get(taskId) ?? []
    }));
  }

  public async update(id: TaskId, input: UpdateTaskInput): Promise<Task | null> {
    const values: {
      readonly description?: string | null;
      readonly parent_task_id?: string | null;
      readonly title?: string;
      readonly updated_at: string;
      readonly working_directory?: string | null;
    } = {
      updated_at: new Date().toISOString()
    };

    const row = await this.db
      .updateTable("tasks")
      .set({
        ...values,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.parentTaskId !== undefined ? { parent_task_id: input.parentTaskId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.workingDirectory !== undefined
          ? { working_directory: input.workingDirectory }
          : {})
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
    title: row.title,
    updatedAt: new Date(row.updated_at),
    workingDirectory: row.working_directory
  };
}
