import { z } from "zod";
import { defaultWorktreePath } from "@tasker/core";
import type { TaskActionOptions } from "./task-action-options.js";

const taskActionWorktreeValueSchema = z
  .object({
    enabled: z.boolean(),
    path: z.string().optional()
  })
  .strict();

export const taskActionPromptValuesSchema = z
  .object({
    worktree: taskActionWorktreeValueSchema.optional()
  })
  .strict();

export type TaskActionPromptValues = z.infer<typeof taskActionPromptValuesSchema>;

export function parseTaskActionPromptValues(value: unknown): TaskActionPromptValues {
  return taskActionPromptValuesSchema.parse(value);
}

export function resolveWorktreeForPrompt(
  actionOptions: TaskActionOptions | null,
  values: TaskActionPromptValues | undefined
): { readonly enabled: boolean; readonly path: string } | undefined {
  if (actionOptions?.worktree == null) {
    return undefined;
  }

  const worktreeValues = values?.worktree;
  const enabled = worktreeValues?.enabled ?? actionOptions.worktree.default;
  if (!enabled) {
    return undefined;
  }

  const defaultPath =
    actionOptions.worktree.fields?.path?.default ?? defaultWorktreePath;
  const path = worktreeValues?.path?.trim();

  return {
    enabled: true,
    path: path == null || path.length === 0 ? defaultPath : path
  };
}
