import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type {
  Database,
  WorkingDirectoryOptionRow,
  WorkingPathSettingsRow
} from "../db/schema.js";
import type {
  CreateWorkingDirectoryOptionInput,
  UpdateWorkingDirectoryOptionInput,
  UpdateWorkingPathSettingsInput,
  WorkingDirectoryOption,
  WorkingPathSettings
} from "../domain/working-paths.js";

export type WorkingPathRepository = {
  readonly createOption: (
    input: CreateWorkingDirectoryOptionInput
  ) => Promise<WorkingDirectoryOption>;
  readonly deleteOption: (id: string) => Promise<boolean>;
  readonly getSettings: () => Promise<WorkingPathSettings>;
  readonly listOptions: () => Promise<readonly WorkingDirectoryOption[]>;
  readonly updateOption: (
    id: string,
    input: UpdateWorkingDirectoryOptionInput
  ) => Promise<WorkingDirectoryOption | null>;
  readonly updateSettings: (
    input: UpdateWorkingPathSettingsInput
  ) => Promise<WorkingPathSettings>;
};

export class SqliteWorkingPathRepository implements WorkingPathRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async createOption(
    input: CreateWorkingDirectoryOptionInput
  ): Promise<WorkingDirectoryOption> {
    const now = new Date().toISOString();
    const row = await this.db
      .insertInto("working_directory_options")
      .values({
        created_at: now,
        id: randomUUID(),
        label: input.label,
        path: input.path,
        sort_order: input.sortOrder ?? 0,
        updated_at: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toWorkingDirectoryOption(row);
  }

  public async deleteOption(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("working_directory_options")
      .where("id", "=", id)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  }

  public async getSettings(): Promise<WorkingPathSettings> {
    const row = await this.db
      .selectFrom("working_path_settings")
      .selectAll()
      .where("id", "=", 1)
      .executeTakeFirst();

    if (row != null) {
      return toWorkingPathSettings(row);
    }

    return this.createDefaultSettings();
  }

  public async listOptions(): Promise<readonly WorkingDirectoryOption[]> {
    const rows = await this.db
      .selectFrom("working_directory_options")
      .selectAll()
      .orderBy("sort_order", "asc")
      .orderBy("label", "asc")
      .execute();

    return rows.map(toWorkingDirectoryOption);
  }

  public async updateOption(
    id: string,
    input: UpdateWorkingDirectoryOptionInput
  ): Promise<WorkingDirectoryOption | null> {
    const values = {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.path !== undefined ? { path: input.path } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {})
    };

    if (Object.keys(values).length > 0) {
      await this.db
        .updateTable("working_directory_options")
        .set({
          ...values,
          updated_at: new Date().toISOString()
        })
        .where("id", "=", id)
        .execute();
    }

    const row = await this.db
      .selectFrom("working_directory_options")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row == null ? null : toWorkingDirectoryOption(row);
  }

  public async updateSettings(
    input: UpdateWorkingPathSettingsInput
  ): Promise<WorkingPathSettings> {
    const values = {
      ...(input.defaultWorkingDirectory !== undefined
        ? { default_working_directory: input.defaultWorkingDirectory }
        : {}),
      ...(input.defaultWorktreePath !== undefined
        ? { default_worktree_path: input.defaultWorktreePath }
        : {})
    };

    if (Object.keys(values).length > 0) {
      await this.db
        .insertInto("working_path_settings")
        .values({
          default_working_directory: input.defaultWorkingDirectory ?? null,
          default_worktree_path: input.defaultWorktreePath ?? "~/wt",
          id: 1,
          updated_at: new Date().toISOString()
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            ...values,
            updated_at: new Date().toISOString()
          })
        )
        .execute();
    }

    return this.getSettings();
  }

  private async createDefaultSettings(): Promise<WorkingPathSettings> {
    const row = await this.db
      .insertInto("working_path_settings")
      .values({
        default_working_directory: null,
        default_worktree_path: "~/wt",
        id: 1
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toWorkingPathSettings(row);
  }
}

function toWorkingPathSettings(row: WorkingPathSettingsRow): WorkingPathSettings {
  return {
    defaultWorkingDirectory: row.default_working_directory,
    defaultWorktreePath: row.default_worktree_path,
    updatedAt: new Date(row.updated_at)
  };
}

function toWorkingDirectoryOption(
  row: WorkingDirectoryOptionRow
): WorkingDirectoryOption {
  return {
    createdAt: new Date(row.created_at),
    id: row.id,
    label: row.label,
    path: row.path,
    sortOrder: row.sort_order,
    updatedAt: new Date(row.updated_at)
  };
}
