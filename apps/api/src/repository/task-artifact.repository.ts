import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskArtifactRow } from "../db/schema.js";
import type {
  CreateTaskArtifactInput,
  TaskArtifact
} from "../domain/task-artifact.js";
import type { TaskId } from "../domain/task.js";

export type TaskArtifactRepository = {
  readonly createForTask: (
    taskId: TaskId,
    input: CreateTaskArtifactInput
  ) => Promise<TaskArtifact>;
  readonly listByTaskId: (taskId: TaskId) => Promise<readonly TaskArtifact[]>;
};

export class SqliteTaskArtifactRepository implements TaskArtifactRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async createForTask(
    taskId: TaskId,
    input: CreateTaskArtifactInput
  ): Promise<TaskArtifact> {
    const row = await this.db
      .insertInto("task_artifacts")
      .values({
        created_at: new Date().toISOString(),
        id: randomUUID(),
        kind: input.kind,
        label: input.label,
        task_id: taskId,
        uri: input.uri
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTaskArtifact(row);
  }

  public async listByTaskId(taskId: TaskId): Promise<readonly TaskArtifact[]> {
    const rows = await this.db
      .selectFrom("task_artifacts")
      .selectAll()
      .where("task_id", "=", taskId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map(toTaskArtifact);
  }
}

function toTaskArtifact(row: TaskArtifactRow): TaskArtifact {
  return {
    createdAt: new Date(row.created_at),
    id: row.id,
    kind: row.kind,
    label: row.label,
    taskId: row.task_id,
    uri: row.uri
  };
}
