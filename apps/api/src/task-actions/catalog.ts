import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { taskActionOptionsSchema } from "../domain/task-action-options.js";
import { taskStates } from "../domain/task.js";

const taskActionCatalogEntrySchema = z.object({
  description: z.string().min(1),
  enabled: z.boolean().default(true),
  iconName: z.string().min(1).nullable().optional(),
  id: z.string().min(1),
  label: z.string().min(1),
  options: taskActionOptionsSchema.nullable().optional(),
  promptTemplate: z.string().min(1),
  recommendationStates: z.array(z.enum(taskStates)).default([]),
  sortOrder: z.number().int().nonnegative()
});

const taskActionCatalogSchema = z.array(taskActionCatalogEntrySchema).min(1);

export type TaskActionCatalogEntry = z.infer<typeof taskActionCatalogEntrySchema>;

export function parseTaskActionCatalog(raw: unknown): readonly TaskActionCatalogEntry[] {
  return taskActionCatalogSchema.parse(raw);
}

export function loadTaskActionCatalog(
  catalogPath = getDefaultTaskActionsPath()
): readonly TaskActionCatalogEntry[] {
  return parseTaskActionCatalog(JSON.parse(readFileSync(catalogPath, "utf8")) as unknown);
}

export function getDefaultTaskActionsPath(): string {
  const taskerRoot = normalizeOptionalEnv(process.env["TASKER_APP_ROOT"]);
  if (taskerRoot != null) {
    return join(taskerRoot, "apps/api/task-actions.json");
  }

  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDirectory, "../task-actions.json"),
    join(moduleDirectory, "../../task-actions.json")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
