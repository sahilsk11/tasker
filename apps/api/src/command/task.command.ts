import { z } from "zod";
import type { CreateTaskInput } from "../domain/task.js";

const createTaskSchema = z.object({
  description: z.string().nullable().default(null),
  parentTaskId: z.string().nullable().default(null),
  title: z.string().min(1),
  workingDirectory: z.string().nullable().optional()
});

export function parseCreateTaskInput(body: unknown): CreateTaskInput {
  const parsed = createTaskSchema.parse(body);
  return {
    description: parsed.description,
    parentTaskId: parsed.parentTaskId,
    title: parsed.title,
    ...(parsed.workingDirectory !== undefined
      ? { workingDirectory: parsed.workingDirectory }
      : {})
  };
}
