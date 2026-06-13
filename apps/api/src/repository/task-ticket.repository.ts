import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, TaskTicketRow } from "../db/schema.js";
import type {
  CreateTaskTicketInput,
  TaskTicket
} from "../domain/task-ticket.js";
import type { TaskId } from "../domain/task.js";

export type TaskTicketRepository = {
  readonly createForTask: (
    taskId: TaskId,
    input: CreateTaskTicketInput
  ) => Promise<TaskTicket>;
  readonly listByTaskId: (taskId: TaskId) => Promise<readonly TaskTicket[]>;
};

export class SqliteTaskTicketRepository implements TaskTicketRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async createForTask(
    taskId: TaskId,
    input: CreateTaskTicketInput
  ): Promise<TaskTicket> {
    const row = await this.db
      .insertInto("task_tickets")
      .values({
        created_at: new Date().toISOString(),
        external_id: input.externalId,
        id: randomUUID(),
        task_id: taskId,
        url: input.url
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toTaskTicket(row);
  }

  public async listByTaskId(taskId: TaskId): Promise<readonly TaskTicket[]> {
    const rows = await this.db
      .selectFrom("task_tickets")
      .selectAll()
      .where("task_id", "=", taskId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map(toTaskTicket);
  }
}

function toTaskTicket(row: TaskTicketRow): TaskTicket {
  return {
    createdAt: new Date(row.created_at),
    externalId: row.external_id,
    id: row.id,
    taskId: row.task_id,
    url: row.url
  };
}
