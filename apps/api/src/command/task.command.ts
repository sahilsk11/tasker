import { z } from "zod";
import { taskStates, type CreateTaskInput, type UpdateTaskInput } from "../domain/task.js";

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

const updateTaskSchema = z.object({
  description: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  state: z.enum(taskStates).optional(),
  title: z.string().min(1).optional(),
  workingDirectory: z.string().nullable().optional()
});

export function parseUpdateTaskInput(body: unknown): UpdateTaskInput {
  const parsed = updateTaskSchema.parse(body);
  return {
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
    ...(parsed.parentTaskId !== undefined ? { parentTaskId: parsed.parentTaskId } : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...(parsed.title !== undefined ? { title: parsed.title } : {}),
    ...(parsed.workingDirectory !== undefined
      ? { workingDirectory: parsed.workingDirectory }
      : {})
  };
}
