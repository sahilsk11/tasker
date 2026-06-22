import type { Kysely } from "kysely";
import type { Database, WorkingPathSettingsRow } from "../db/schema.js";
import type {
  GeneratedUrlMode,
  UpdateWorkingPathSettingsInput,
  WorkingPathSettings
} from "../domain/working-paths.js";

export type WorkingPathRepository = {
  readonly getSettings: () => Promise<WorkingPathSettings>;
  readonly updateSettings: (
    input: UpdateWorkingPathSettingsInput
  ) => Promise<WorkingPathSettings>;
};

export type WorkingPathRepositoryDefaults = {
  readonly generatedUrlMode?: GeneratedUrlMode;
  readonly publicAppBaseUrl?: string | null;
};

export class SqliteWorkingPathRepository implements WorkingPathRepository {
  public constructor(
    private readonly db: Kysely<Database>,
    private readonly defaults: WorkingPathRepositoryDefaults = {}
  ) {}

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

  public async updateSettings(
    input: UpdateWorkingPathSettingsInput
  ): Promise<WorkingPathSettings> {
    const values = {
      ...(input.defaultWorkingDirectory !== undefined
        ? { default_working_directory: input.defaultWorkingDirectory }
        : {}),
      ...(input.defaultWorktreePath !== undefined
        ? { default_worktree_path: input.defaultWorktreePath }
        : {}),
      ...(input.generatedUrlMode !== undefined
        ? { generated_url_mode: input.generatedUrlMode }
        : {}),
      ...(input.publicAppBaseUrl !== undefined
        ? { public_app_base_url: input.publicAppBaseUrl }
        : {})
    };

    if (Object.keys(values).length > 0) {
      await this.db
        .insertInto("working_path_settings")
        .values({
          default_working_directory: input.defaultWorkingDirectory ?? null,
          default_worktree_path: input.defaultWorktreePath ?? "~/wt",
          generated_url_mode:
            input.generatedUrlMode ?? this.defaults.generatedUrlMode ?? "localhost",
          id: 1,
          public_app_base_url:
            input.publicAppBaseUrl !== undefined
              ? input.publicAppBaseUrl
              : this.defaults.publicAppBaseUrl ?? null,
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
        generated_url_mode: this.defaults.generatedUrlMode ?? "localhost",
        id: 1,
        public_app_base_url: this.defaults.publicAppBaseUrl ?? null
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
    generatedUrlMode: row.generated_url_mode,
    publicAppBaseUrl: row.public_app_base_url,
    updatedAt: new Date(row.updated_at)
  };
}
