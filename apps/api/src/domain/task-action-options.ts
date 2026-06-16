import { z } from "zod";

const taskActionOptionFieldSchema = z.object({
  default: z.string(),
  type: z.literal("text")
});

const taskActionBooleanOptionSchema = z.object({
  default: z.boolean(),
  fields: z
    .object({
      path: taskActionOptionFieldSchema
    })
    .partial()
    .optional(),
  label: z.string().min(1),
  type: z.literal("boolean")
});

export const taskActionOptionsSchema = z
  .object({
    worktree: taskActionBooleanOptionSchema.optional()
  })
  .strict();

export type TaskActionOptions = z.infer<typeof taskActionOptionsSchema>;

export function parseTaskActionOptions(value: string | null): TaskActionOptions | null {
  if (value == null) {
    return null;
  }

  return taskActionOptionsSchema.parse(JSON.parse(value));
}
