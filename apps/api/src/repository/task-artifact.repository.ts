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
  readonly findByTaskIdAndId: (
    taskId: TaskId,
    artifactId: string
  ) => Promise<TaskArtifact | null>;
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
        created_by_session_id: input.createdBySessionId ?? null,
        id: randomUUID(),
        kind: input.kind,
        label: input.label,
        task_id: taskId,
        uri: input.uri
      })
      .onConflict((oc) => oc.columns(["task_id", "kind", "uri"]).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (row == null) {
      return this.findByTaskIdKindAndUri(taskId, input.kind, input.uri);
    }

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

  public async findByTaskIdAndId(
    taskId: TaskId,
    artifactId: string
  ): Promise<TaskArtifact | null> {
    const row = await this.db
      .selectFrom("task_artifacts")
      .selectAll()
      .where("task_id", "=", taskId)
      .where("id", "=", artifactId)
      .executeTakeFirst();

    return row == null ? null : toTaskArtifact(row);
  }

  private async findByTaskIdKindAndUri(
    taskId: TaskId,
    kind: string,
    uri: string
  ): Promise<TaskArtifact> {
    const row = await this.db
      .selectFrom("task_artifacts")
      .selectAll()
      .where("task_id", "=", taskId)
      .where("kind", "=", kind)
      .where("uri", "=", uri)
      .executeTakeFirstOrThrow();

    return toTaskArtifact(row);
  }
}

function toTaskArtifact(row: TaskArtifactRow): TaskArtifact {
  return {
    createdAt: new Date(row.created_at),
    createdBySessionId: row.created_by_session_id,
    id: row.id,
    kind: row.kind,
    label: row.label,
    taskId: row.task_id,
    uri: row.uri
  };
}
