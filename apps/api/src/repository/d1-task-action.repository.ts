import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { TaskActionRecord, UpdateTaskActionInput } from "../domain/task-action.js";
import { ConflictError } from "../service/errors.js";
import {
  taskActionCatalogEntrySchema,
  type TaskActionCatalogEntry
} from "../task-actions/catalog.js";
import {
  applyTaskActionUpdate,
  compareTaskActionRecords,
  toTaskActionRecord,
  type TaskActionRepository
} from "./task-action.repository.js";

const catalogDate = new Date("2026-11-23T00:00:00Z");

export class D1TaskActionRepository implements TaskActionRepository {
  public constructor(
    private readonly db: Kysely<Database>,
    private readonly catalog: readonly TaskActionCatalogEntry[]
  ) {}

  public async listAll(): Promise<readonly TaskActionRecord[]> {
    const rows = await this.db.selectFrom("task_action_overrides").selectAll().execute();
    const byId = new Map(rows.map((row) => [row.id, row]));
    return this.catalog.map((entry) => {
      const row = byId.get(entry.id);
      return row == null
        ? toTaskActionRecord(entry, catalogDate)
        : toTaskActionRecord(parseEntry(row.entry_json), new Date(row.updated_at));
    }).sort(compareTaskActionRecords);
  }

  public async listEnabled(): Promise<readonly TaskActionRecord[]> {
    return (await this.listAll()).filter((record) => record.enabled);
  }

  public async findById(id: string): Promise<TaskActionRecord | null> {
    const record = await this.findEditableById(id);
    return record?.enabled === true ? record : null;
  }

  public async findEditableById(id: string): Promise<TaskActionRecord | null> {
    const entry = this.catalog.find((action) => action.id === id);
    if (entry == null) {
      return null;
    }
    const row = await this.db.selectFrom("task_action_overrides").selectAll()
      .where("id", "=", id).executeTakeFirst();
    return row == null
      ? toTaskActionRecord(entry, catalogDate)
      : toTaskActionRecord(parseEntry(row.entry_json), new Date(row.updated_at));
  }

  public async update(id: string, input: UpdateTaskActionInput): Promise<TaskActionRecord | null> {
    const entry = this.catalog.find((action) => action.id === id);
    if (entry == null) {
      return null;
    }
    const existing = await this.db.selectFrom("task_action_overrides").selectAll()
      .where("id", "=", id).executeTakeFirst();
    const updated = taskActionCatalogEntrySchema.parse(
      applyTaskActionUpdate(existing == null ? entry : parseEntry(existing.entry_json), input)
    );
    const now = new Date();
    const values = { entry_json: JSON.stringify(updated), updated_at: now.toISOString() };
    const saved = existing == null
      ? await this.db.insertInto("task_action_overrides").values({ id, ...values })
        .onConflict((conflict) => conflict.doNothing()).returning("id").executeTakeFirst()
      : await this.db.updateTable("task_action_overrides").set(values)
        .where("id", "=", id).where("entry_json", "=", existing.entry_json)
        .returning("id").executeTakeFirst();

    if (saved == null) {
      throw new ConflictError("This action changed while you edited it. Reload the settings and try again.");
    }
    return toTaskActionRecord(updated, now);
  }
}

function parseEntry(json: string): TaskActionCatalogEntry {
  return taskActionCatalogEntrySchema.parse(JSON.parse(json) as unknown);
}
