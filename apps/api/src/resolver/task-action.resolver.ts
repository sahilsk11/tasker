import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { taskActionOptionsSchema } from "../domain/task-action-options.js";
import type { UpdateTaskActionInput } from "../domain/task-action.js";
import { taskStates } from "../domain/task.js";
import type { TaskService } from "../service/task.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
});

const actionIdParamsSchema = z.object({
  actionId: z.string().min(1)
});

const updateTaskActionSchema = z
  .object({
    description: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    iconName: z.string().min(1).nullable().optional(),
    label: z.string().min(1).optional(),
    options: taskActionOptionsSchema.nullable().optional(),
    promptTemplate: z.string().min(1).optional(),
    recommendationStates: z.array(z.enum(taskStates)).optional(),
    sortOrder: z.number().int().min(0).optional()
  })
  .strict();

export function registerTaskActionResolver(
  server: FastifyInstance,
  taskService: TaskService
): void {
  server.get("/actions", async () => ({
    actions: await taskService.listActionSettings()
  }));

  server.patch("/actions/:actionId", async (request) => {
    const { actionId } = actionIdParamsSchema.parse(request.params);
    const action = await taskService.updateActionSettings(
      actionId,
      parseUpdateTaskActionInput(request.body)
    );
    return { action };
  });

  server.get("/tasks/:id/actions", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { actions: await taskService.listActions(id) };
  });
}

function parseUpdateTaskActionInput(body: unknown): UpdateTaskActionInput {
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
    ...(parsed.recommendationStates !== undefined
      ? { recommendationStates: parsed.recommendationStates }
      : {}),
    ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {})
  };
}
