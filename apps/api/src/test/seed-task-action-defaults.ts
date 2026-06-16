import { applyTaskActionDefaultsAtPath } from "../task-actions/apply-defaults.js";

export async function seedTaskActionDefaults(databasePath: string): Promise<void> {
  await applyTaskActionDefaultsAtPath(databasePath, { mode: "insert-missing" });
}
