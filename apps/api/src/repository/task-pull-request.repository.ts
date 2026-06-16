import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskPullRequestRow } from "../db/schema.js";
import type {
  CreateTaskPullRequestInput,
  TaskPullRequest
} from "../domain/task-pull-request.js";
import type { TaskId } from "../domain/task.js";

export type TaskPullRequestRepository = {
  readonly createForTask: (
    taskId: TaskId,
    input: CreateTaskPullRequestInput
  ) => Promise<TaskPullRequest>;
  readonly listByTaskId: (taskId: TaskId) => Promise<readonly TaskPullRequest[]>;
};

export class SqliteTaskPullRequestRepository implements TaskPullRequestRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async createForTask(
    taskId: TaskId,
    input: CreateTaskPullRequestInput
  ): Promise<TaskPullRequest> {
    const row = await this.db
      .insertInto("task_pull_requests")
      .values({
        created_at: new Date().toISOString(),
        id: randomUUID(),
        task_id: taskId,
        url: input.url
      })
      .onConflict((oc) => oc.columns(["task_id", "url"]).doNothing())
      .returningAll()
      .executeTakeFirst();

    if (row == null) {
      return this.findByTaskIdAndUrl(taskId, input.url);
    }

    return toTaskPullRequest(row);
  }

  public async listByTaskId(taskId: TaskId): Promise<readonly TaskPullRequest[]> {
    const rows = await this.db
      .selectFrom("task_pull_requests")
      .selectAll()
      .where("task_id", "=", taskId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map(toTaskPullRequest);
  }

  private async findByTaskIdAndUrl(
    taskId: TaskId,
    url: string
  ): Promise<TaskPullRequest> {
    const row = await this.db
      .selectFrom("task_pull_requests")
      .selectAll()
      .where("task_id", "=", taskId)
      .where("url", "=", url)
      .executeTakeFirstOrThrow();

    return toTaskPullRequest(row);
  }
}

function toTaskPullRequest(row: TaskPullRequestRow): TaskPullRequest {
  return {
    createdAt: new Date(row.created_at),
    id: row.id,
    taskId: row.task_id,
    url: row.url
  };
}
