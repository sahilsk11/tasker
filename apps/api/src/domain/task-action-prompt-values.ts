import { z } from "zod";
import type { TaskActionOptions } from "./task-action-options.js";

const taskActionOptionValueSchema = z
  .object({
    enabled: z.boolean(),
    fields: z.record(z.string(), z.string()).optional()
  })
  .strict();

export const taskActionPromptValuesSchema = z
  .object({
    options: z.record(z.string(), taskActionOptionValueSchema).optional(),
    workingPath: z.string().optional()
  })
  .strict();

export type TaskActionPromptValues = z.infer<typeof taskActionPromptValuesSchema>;

export function resolveWorkingPathForPrompt(
  values: TaskActionPromptValues | undefined
): string | undefined {
  const path = values?.workingPath?.trim();
  return path == null || path.length === 0 ? undefined : path;
}

export function parseTaskActionPromptValues(value: unknown): TaskActionPromptValues {
  return taskActionPromptValuesSchema.parse(value);
}

export function renderOptionsForPrompt(
  actionOptions: TaskActionOptions | null,
  values: TaskActionPromptValues | undefined
): string | undefined {
  if (actionOptions == null) {
    return "";
  }

  return Object.entries(actionOptions)
    .map(([optionId, option]) => {
      const optionValues = values?.options?.[optionId];
      const enabled = optionValues?.enabled ?? option.default;
      const template = enabled ? option.prompt?.enabled : option.prompt?.disabled;
      if (template == null || template.trim().length === 0) {
        return "";
      }

      return template.replace(/\{\{(\w+)\}\}/g, (_match, fieldId: string) => {
        const submittedValue = optionValues?.fields?.[fieldId]?.trim();
        if (submittedValue != null && submittedValue.length > 0) {
          return submittedValue;
        }

        return option.fields?.[fieldId]?.default ?? "";
      });
    })
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}
