import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseCreateTaskInput } from "../command/task.command.js";
import { taskStateDefinitions, taskStates } from "../domain/task.js";
import type { UpdateTaskInput } from "../domain/task.js";
import type { TaskService } from "../service/task.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
});

const listTasksQuerySchema = z.object({
  parentTaskId: z.string().min(1).optional()
});

const updateTaskSchema = z.object({
  description: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  state: z.enum(taskStates).optional(),
  title: z.string().min(1).optional(),
  workingDirectory: z.string().nullable().optional()
});

export function registerTaskResolver(
  server: FastifyInstance,
  taskService: TaskService
): void {
  server.get("/tasks", async (request) => {
    const { parentTaskId } = listTasksQuerySchema.parse(request.query);
    return {
      tasks: await taskService.listTasks({ parentTaskId: parentTaskId ?? null })
    };
  });

  server.get("/task-states", () => ({
    states: taskStateDefinitions
  }));

  server.post("/tasks", async (request, reply) => {
    const task = await taskService.createTask(parseCreateTaskInput(request.body));
    return reply.code(201).send({ task });
  });

  server.get("/tasks/:id", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { task: await taskService.getTask(id) };
  });

  server.patch("/tasks/:id", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const task = await taskService.updateTask(id, parseUpdateTaskInput(request.body));
    return { task };
  });

  server.get("/tasks/:id/children", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { tasks: await taskService.listChildren(id) };
  });
}

function parseUpdateTaskInput(body: unknown): UpdateTaskInput {
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
