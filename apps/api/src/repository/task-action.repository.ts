import type { Kysely } from "kysely";
import type { Database, TaskActionRow } from "../db/schema.js";
import { parseTaskActionOptions } from "../domain/task-action-options.js";
import type {
  TaskActionDetails,
  TaskActionRecord,
  UpdateTaskActionInput
} from "../domain/task-action.js";

export type TaskActionRepository = {
  readonly findById: (id: string) => Promise<TaskActionRecord | null>;
  readonly findEditableById: (id: string) => Promise<TaskActionRecord | null>;
  readonly listAll: () => Promise<readonly TaskActionRecord[]>;
  readonly listEnabled: () => Promise<readonly TaskActionRecord[]>;
  readonly update: (
    id: string,
    input: UpdateTaskActionInput
  ) => Promise<TaskActionRecord | null>;
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

  public async findEditableById(id: string): Promise<TaskActionRecord | null> {
    const row = await this.db
      .selectFrom("task_actions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row == null ? null : toTaskActionRecord(row);
  }

  public async listAll(): Promise<readonly TaskActionRecord[]> {
    const rows = await this.db
      .selectFrom("task_actions")
      .selectAll()
      .orderBy("sort_order", "asc")
      .orderBy("label", "asc")
      .execute();

    return rows.map(toTaskActionRecord);
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

  public async update(
    id: string,
    input: UpdateTaskActionInput
  ): Promise<TaskActionRecord | null> {
    const values = toTaskActionUpdateValues(input);
    if (Object.keys(values).length > 0) {
      await this.db
        .updateTable("task_actions")
        .set({
          ...values,
          updated_at: new Date().toISOString()
        })
        .where("id", "=", id)
        .execute();
    }

    return this.findEditableById(id);
  }
}

function toTaskActionUpdateValues(input: UpdateTaskActionInput) {
  return {
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled ? 1 : 0 } : {}),
    ...(input.iconName !== undefined ? { icon_name: input.iconName } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.options !== undefined ? { options_json: serializeOptions(input.options) } : {}),
    ...(input.promptTemplate !== undefined
      ? { prompt_template: input.promptTemplate }
      : {}),
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {})
  };
}

function toTaskActionRecord(row: TaskActionRow): TaskActionRecord {
  return {
    createdAt: new Date(row.created_at),
    description: row.description,
    enabled: row.enabled === 1,
    iconName: row.icon_name,
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
    iconName: record.iconName,
    id: record.id,
    label: record.label,
    options: record.options
  };
}

export function toTaskAction(record: TaskActionRecord) {
  return toTaskActionSummary(record);
}

export function toTaskActionDetails(record: TaskActionRecord): TaskActionDetails {
  return {
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    enabled: record.enabled,
    iconName: record.iconName,
    id: record.id,
    label: record.label,
    options: record.options,
    promptTemplate: record.promptTemplate,
    sortOrder: record.sortOrder,
    updatedAt: record.updatedAt.toISOString()
  };
}

function serializeOptions(options: UpdateTaskActionInput["options"]): string | null {
  return options == null ? null : JSON.stringify(options);
}
