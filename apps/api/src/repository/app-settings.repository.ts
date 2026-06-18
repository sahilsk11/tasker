import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { AppSettings, UpdateAppSettingsInput } from "../domain/app-settings.js";

const defaultSettings: AppSettings = {
  defaultWorkingDirectory: null
};

export type AppSettingsRepository = {
  readonly get: () => Promise<AppSettings>;
  readonly update: (input: UpdateAppSettingsInput) => Promise<AppSettings>;
};

export class SqliteAppSettingsRepository implements AppSettingsRepository {
  public constructor(private readonly db: Kysely<Database>) {}

  public async get(): Promise<AppSettings> {
    const rows = await this.db
      .selectFrom("app_settings")
      .select(["key", "value_json"])
      .execute();

    return rows.reduce<AppSettings>((settings, row) => {
      if (row.key !== "defaultWorkingDirectory") {
        return settings;
      }

      return {
        ...settings,
        defaultWorkingDirectory: parseNullableString(row.value_json)
      };
    }, defaultSettings);
  }

  public async update(input: UpdateAppSettingsInput): Promise<AppSettings> {
    if (input.defaultWorkingDirectory !== undefined) {
      await this.upsert("defaultWorkingDirectory", input.defaultWorkingDirectory);
    }

    return this.get();
  }

  private async upsert(key: string, value: string | null): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .insertInto("app_settings")
      .values({
        key,
        updated_at: now,
        value_json: JSON.stringify(value)
      })
      .onConflict((oc) =>
        oc.column("key").doUpdateSet({
          updated_at: now,
          value_json: JSON.stringify(value)
        })
      )
      .execute();
  }
}

function parseNullableString(valueJson: string): string | null {
  const parsed = JSON.parse(valueJson) as unknown;
  return typeof parsed === "string" ? parsed : null;
}
