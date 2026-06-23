import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskArtifactRow } from "../db/schema.js";
import type {
  CreateTaskArtifactInput,
  TaskArtifact,
  TaskArtifactId
} from "../domain/task-artifact.js";
import type { TaskId } from "../domain/task.js";

export type ListTaskArtifactsOptions = {
  readonly includeArchived?: boolean;
};

export type TaskArtifactRepository = {
  readonly archive: (
    taskId: TaskId,
    artifactId: TaskArtifactId,
    input: { readonly uri: string }
  ) => Promise<TaskArtifact | null>;
  readonly createForTask: (
    taskId: TaskId,
    input: CreateTaskArtifactInput
  ) => Promise<TaskArtifact>;
  readonly deleteByTaskIdAndId: (
    taskId: TaskId,
    artifactId: TaskArtifactId
  ) => Promise<TaskArtifact | null>;
  readonly findByTaskIdAndId: (
    taskId: TaskId,
    artifactId: TaskArtifactId
  ) => Promise<TaskArtifact | null>;
  readonly listByTaskId: (
    taskId: TaskId,
    options?: ListTaskArtifactsOptions
  ) => Promise<readonly TaskArtifact[]>;
  readonly restore: (
    taskId: TaskId,
    artifactId: TaskArtifactId,
    input: { readonly uri: string }
  ) => Promise<TaskArtifact | null>;
};

export class SqliteTaskArtifactRepository implements TaskArtifactRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async createForTask(
    taskId: TaskId,
    input: CreateTaskArtifactInput
  ): Promise<TaskArtifact> {
    const dedupeKey = getArtifactDedupeKey(input.label, input.uri);
    const row = await this.db
      .insertInto("task_artifacts")
      .values({
        archived_at: null,
        created_at: new Date().toISOString(),
        created_by_session_id: input.createdBySessionId ?? null,
        dedupe_key: dedupeKey,
        id: randomUUID(),
        label: input.label,
        task_id: taskId,
        uri: input.uri
      })
      .onConflict((oc) => oc.columns(["task_id", "dedupe_key"]).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (row == null) {
      return this.findByTaskIdAndDedupeKey(taskId, dedupeKey);
    }

    return toTaskArtifact(row);
  }

  public async archive(
    taskId: TaskId,
    artifactId: TaskArtifactId,
    input: { readonly uri: string }
  ): Promise<TaskArtifact | null> {
    const row = await this.db
      .updateTable("task_artifacts")
      .set({
        archived_at: new Date().toISOString(),
        uri: input.uri
      })
      .where("task_id", "=", taskId)
      .where("id", "=", artifactId)
      .where("archived_at", "is", null)
      .returningAll()
      .executeTakeFirst();

    return row == null ? null : toTaskArtifact(row);
  }

  public async restore(
    taskId: TaskId,
    artifactId: TaskArtifactId,
    input: { readonly uri: string }
  ): Promise<TaskArtifact | null> {
    const row = await this.db
      .updateTable("task_artifacts")
      .set({
        archived_at: null,
        uri: input.uri
      })
      .where("task_id", "=", taskId)
      .where("id", "=", artifactId)
      .where("archived_at", "is not", null)
      .returningAll()
      .executeTakeFirst();

    return row == null ? null : toTaskArtifact(row);
  }

  public async deleteByTaskIdAndId(
    taskId: TaskId,
    artifactId: TaskArtifactId
  ): Promise<TaskArtifact | null> {
    const row = await this.db
      .deleteFrom("task_artifacts")
      .where("task_id", "=", taskId)
      .where("id", "=", artifactId)
      .returningAll()
      .executeTakeFirst();

    return row == null ? null : toTaskArtifact(row);
  }

  public async listByTaskId(
    taskId: TaskId,
    options: ListTaskArtifactsOptions = {}
  ): Promise<readonly TaskArtifact[]> {
    let query = this.db
      .selectFrom("task_artifacts")
      .selectAll()
      .where("task_id", "=", taskId);

    if (options.includeArchived !== true) {
      query = query.where("archived_at", "is", null);
    }

    const rows = await query
      .orderBy("created_at", "asc")
      .execute();

    return rows.map(toTaskArtifact);
  }

  public async findByTaskIdAndId(
    taskId: TaskId,
    artifactId: TaskArtifactId
  ): Promise<TaskArtifact | null> {
    const row = await this.db
      .selectFrom("task_artifacts")
      .selectAll()
      .where("task_id", "=", taskId)
      .where("id", "=", artifactId)
      .executeTakeFirst();

    return row == null ? null : toTaskArtifact(row);
  }

  private async findByTaskIdAndDedupeKey(
    taskId: TaskId,
    dedupeKey: string
  ): Promise<TaskArtifact> {
    const row = await this.db
      .selectFrom("task_artifacts")
      .selectAll()
      .where("task_id", "=", taskId)
      .where("dedupe_key", "=", dedupeKey)
      .executeTakeFirstOrThrow();

    return toTaskArtifact(row);
  }
}

function toTaskArtifact(row: TaskArtifactRow): TaskArtifact {
  return {
    archivedAt: row.archived_at == null ? null : new Date(row.archived_at),
    createdAt: new Date(row.created_at),
    createdBySessionId: row.created_by_session_id,
    id: row.id,
    label: row.label,
    taskId: row.task_id,
    uri: row.uri
  };
}

function getArtifactDedupeKey(
  label: CreateTaskArtifactInput["label"],
  uri: string
): string {
  return `artifact:${label}:${Buffer.from(uri, "utf8").toString("hex")}`;
}
