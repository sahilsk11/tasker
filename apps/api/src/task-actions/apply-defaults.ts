import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { loadTaskActionDefaults, type TaskActionDefault } from "./load-defaults.js";

export type ApplyTaskActionDefaultsMode = "insert-missing" | "update";

export type ApplyTaskActionDefaultsResult = {
  readonly inserted: readonly string[];
  readonly skipped: readonly string[];
  readonly updated: readonly string[];
};

export async function applyTaskActionDefaults(
  db: Kysely<Database>,
  {
    defaults = loadTaskActionDefaults(),
    mode = "insert-missing"
  }: {
    readonly defaults?: readonly TaskActionDefault[];
    readonly mode?: ApplyTaskActionDefaultsMode;
  } = {}
): Promise<ApplyTaskActionDefaultsResult> {
  const inserted: string[] = [];
  const skipped: string[] = [];
  const updated: string[] = [];
  const now = new Date().toISOString();

  for (const action of defaults) {
    const existing = await db
      .selectFrom("task_actions")
      .select(["id"])
      .where("id", "=", action.id)
      .executeTakeFirst();

    if (existing == null) {
      await insertTaskAction(db, action, now);
      inserted.push(action.id);
      continue;
    }

    if (mode === "insert-missing") {
      skipped.push(action.id);
      continue;
    }

    await db
      .updateTable("task_actions")
      .set(toRowValues(action, now, { preserveCreatedAt: true }))
      .where("id", "=", action.id)
      .execute();

    updated.push(action.id);
  }

  return { inserted, skipped, updated };
}

export async function applyTaskActionDefaultsAtPath(
  databasePath: string,
  options: {
    readonly defaults?: readonly TaskActionDefault[];
    readonly mode?: ApplyTaskActionDefaultsMode;
  } = {}
): Promise<ApplyTaskActionDefaultsResult> {
  const { createDb } = await import("../db/client.js");
  const db = createDb({ path: databasePath });

  try {
    return await applyTaskActionDefaults(db, options);
  } finally {
    await db.destroy();
  }
}

async function insertTaskAction(
  db: Kysely<Database>,
  action: TaskActionDefault,
  now: string
): Promise<void> {
  await db
    .insertInto("task_actions")
    .values({
      created_at: now,
      description: action.description,
      enabled: action.enabled ? 1 : 0,
      icon_name: action.iconName ?? null,
      id: action.id,
      label: action.label,
      options_json: serializeOptions(action.options),
      prompt_template: action.promptTemplate,
      sort_order: action.sortOrder,
      updated_at: now
    })
    .execute();
}

function toRowValues(
  action: TaskActionDefault,
  now: string,
  { preserveCreatedAt }: { readonly preserveCreatedAt: boolean }
) {
  return {
    description: action.description,
    enabled: action.enabled ? 1 : 0,
    icon_name: action.iconName ?? null,
    label: action.label,
    options_json: serializeOptions(action.options),
    prompt_template: action.promptTemplate,
    sort_order: action.sortOrder,
    updated_at: now,
    ...(preserveCreatedAt ? {} : { created_at: now })
  };
}

function serializeOptions(options: TaskActionDefault["options"]): string | null {
  return options == null ? null : JSON.stringify(options);
}
