import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseUpdateTaskActionInput } from "../command/task-action.command.js";
import type { TaskService } from "../service/task.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
});

const actionIdParamsSchema = z.object({
  actionId: z.string().min(1)
});

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
