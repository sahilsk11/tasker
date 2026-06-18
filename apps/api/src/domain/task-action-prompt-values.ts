import { z } from "zod";
import type { TaskActionOptions } from "./task-action-options.js";

const optionFieldPlaceholderPattern = /\{\{([a-zA-Z0-9_-]+)\}\}/g;

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

export type TaskActionPromptRenderContext = {
  readonly apiBaseUrl: string;
  readonly sessionId: string;
  readonly taskId: string;
};

export function resolveWorkingPathForPrompt(
  values: TaskActionPromptValues | undefined
): string | undefined {
  const path = values?.workingPath?.trim();
  return path == null || path.length === 0 ? undefined : path;
}

export function parseTaskActionPromptValues(value: unknown): TaskActionPromptValues {
  return taskActionPromptValuesSchema.parse(normalizeLegacyPromptValues(value));
}

export function renderOptionsForPrompt(
  actionOptions: TaskActionOptions | null,
  values: TaskActionPromptValues | undefined,
  context?: TaskActionPromptRenderContext
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

      return template.replace(optionFieldPlaceholderPattern, (match, fieldId: string) =>
        replaceOptionPlaceholder({
          context,
          fieldId,
          match,
          option,
          optionValues
        })
      );
    })
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}

function replaceOptionPlaceholder({
  context,
  fieldId,
  match,
  option,
  optionValues
}: {
  readonly context: TaskActionPromptRenderContext | undefined;
  readonly fieldId: string;
  readonly match: string;
  readonly option: NonNullable<TaskActionOptions[string]>;
  readonly optionValues:
    | {
        readonly enabled: boolean;
        readonly fields?: Record<string, string> | undefined;
      }
    | undefined;
}): string {
  const submittedValue = optionValues?.fields?.[fieldId]?.trim();
  if (submittedValue != null && submittedValue.length > 0) {
    return submittedValue;
  }

  const fieldDefault = option.fields?.[fieldId]?.default;
  if (fieldDefault != null) {
    return fieldDefault;
  }

  if (context != null && fieldId in context) {
    return context[fieldId as keyof TaskActionPromptRenderContext];
  }

  return match;
}

function normalizeLegacyPromptValues(value: unknown): unknown {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (record["worktree"] == null || record["options"] != null) {
    return value;
  }

  const worktree = normalizeLegacyWorktreeValue(record["worktree"]);
  if (worktree == null) {
    return value;
  }

  const rest = { ...record };
  delete rest["worktree"];
  return {
    ...rest,
    options: {
      worktree
    }
  };
}

function normalizeLegacyWorktreeValue(value: unknown) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    enabled: record["enabled"] === true,
    fields:
      typeof record["path"] === "string"
        ? {
            path: record["path"]
          }
        : undefined
  };
}
