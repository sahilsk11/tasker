import { z } from "zod";
import type { UpdateTaskActionInput } from "../domain/task-action.js";
import { taskActionOptionsSchema } from "../domain/task-action-options.js";

const updateTaskActionSchema = z
  .object({
    description: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    iconName: z.string().min(1).nullable().optional(),
    label: z.string().min(1).optional(),
    options: taskActionOptionsSchema.nullable().optional(),
    promptTemplate: z.string().min(1).optional(),
    sortOrder: z.number().int().min(0).optional()
  })
  .strict();

export function parseUpdateTaskActionInput(body: unknown): UpdateTaskActionInput {
  const parsed = updateTaskActionSchema.parse(body);
  return {
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
    ...(parsed.enabled !== undefined ? { enabled: parsed.enabled } : {}),
    ...(parsed.iconName !== undefined ? { iconName: parsed.iconName } : {}),
    ...(parsed.label !== undefined ? { label: parsed.label } : {}),
    ...(parsed.options !== undefined ? { options: parsed.options } : {}),
    ...(parsed.promptTemplate !== undefined
      ? { promptTemplate: parsed.promptTemplate }
      : {}),
    ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {})
  };
}
