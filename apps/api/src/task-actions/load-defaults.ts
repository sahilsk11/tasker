import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { taskActionOptionsSchema } from "../domain/task-action-options.js";

const taskActionDefaultSchema = z.object({
  description: z.string().min(1),
  enabled: z.boolean().default(true),
  id: z.string().min(1),
  label: z.string().min(1),
  options: taskActionOptionsSchema.nullable().optional(),
  promptTemplate: z.string().min(1),
  sortOrder: z.number().int().nonnegative()
});

const taskActionDefaultsSchema = z.array(taskActionDefaultSchema).min(1);

export type TaskActionDefault = z.infer<typeof taskActionDefaultSchema>;

export function loadTaskActionDefaults(
  defaultsPath = getDefaultTaskActionsPath()
): readonly TaskActionDefault[] {
  const raw = JSON.parse(readFileSync(defaultsPath, "utf8")) as unknown;
  return taskActionDefaultsSchema.parse(raw);
}

export function getDefaultTaskActionsPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../task-actions.defaults.json");
}
