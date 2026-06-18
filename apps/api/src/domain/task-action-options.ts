import { z } from "zod";

const taskActionOptionFieldSchema = z.object({
  default: z.string(),
  label: z.string().min(1).optional(),
  type: z.literal("text")
});

const taskActionBooleanOptionSchema = z.object({
  default: z.boolean(),
  fields: z.record(z.string().min(1), taskActionOptionFieldSchema).optional(),
  label: z.string().min(1),
  prompt: z
    .object({
      disabled: z.string().optional(),
      enabled: z.string()
    })
    .optional(),
  type: z.literal("boolean")
});

export const taskActionOptionsSchema = z.record(
  z.string().min(1),
  taskActionBooleanOptionSchema
);

export type TaskActionOptions = z.infer<typeof taskActionOptionsSchema>;

export function parseTaskActionOptions(value: string | null): TaskActionOptions | null {
  if (value == null) {
    return null;
  }

  return taskActionOptionsSchema.parse(JSON.parse(value));
}
