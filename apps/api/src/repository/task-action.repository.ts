import type { Kysely } from "kysely";
import type { Database, TaskActionRow } from "../db/schema.js";
import { parseTaskActionOptions } from "../domain/task-action-options.js";
import type { TaskActionRecord } from "../domain/task-action.js";

export type TaskActionRepository = {
  readonly findById: (id: string) => Promise<TaskActionRecord | null>;
  readonly listEnabled: () => Promise<readonly TaskActionRecord[]>;
};

export class SqliteTaskActionRepository implements TaskActionRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async findById(id: string): Promise<TaskActionRecord | null> {
    const row = await this.db
      .selectFrom("task_actions")
      .selectAll()
      .where("id", "=", id)
      .where("enabled", "=", 1)
      .executeTakeFirst();

    return row == null ? null : toTaskActionRecord(row);
  }

  public async listEnabled(): Promise<readonly TaskActionRecord[]> {
    const rows = await this.db
      .selectFrom("task_actions")
      .selectAll()
      .where("enabled", "=", 1)
      .orderBy("sort_order", "asc")
      .orderBy("label", "asc")
      .execute();

    return rows.map(toTaskActionRecord);
  }
}

function toTaskActionRecord(row: TaskActionRow): TaskActionRecord {
  return {
    createdAt: new Date(row.created_at),
    description: row.description,
    enabled: row.enabled === 1,
    id: row.id,
    label: row.label,
    options: parseTaskActionOptions(row.options_json),
    promptTemplate: row.prompt_template,
    sortOrder: row.sort_order,
    updatedAt: new Date(row.updated_at)
  };
}

function toTaskActionSummary(record: TaskActionRecord) {
  return {
    description: record.description,
    id: record.id,
    label: record.label,
    options: record.options
  };
}

export function toTaskAction(record: TaskActionRecord) {
  return toTaskActionSummary(record);
}
