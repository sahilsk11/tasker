import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { UpdateTaskInput } from "../domain/task.js";
import type { TaskService } from "../service/task.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
});

const createTaskSchema = z.object({
  description: z.string().nullable().default(null),
  parentTaskId: z.string().nullable().default(null),
  title: z.string().min(1)
});

const updateTaskSchema = z.object({
  description: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  title: z.string().min(1).optional()
});

const createArtifactSchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1),
  uri: z.string().min(1)
});

const createSessionSchema = z.object({
  provider: z.enum(["codex", "cursor", "opencode"])
});

const createTicketSchema = z.object({
  externalId: z.string().min(1),
  url: z.string().url().nullable().default(null)
});

export function registerTaskResolver(
  server: FastifyInstance,
  taskService: TaskService
): void {
  server.get("/health", () => ({ ok: true }));

  server.get("/tasks", async () => ({
    tasks: await taskService.listTasks()
  }));

  server.post("/tasks", async (request, reply) => {
    const task = await taskService.createTask(createTaskSchema.parse(request.body));
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

  server.get("/tasks/:id/resources", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { resources: await taskService.getResources(id) };
  });

  server.get("/tasks/:id/actions", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { actions: await taskService.listActions(id) };
  });

  server.get("/tasks/:id/artifacts", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { artifacts: await taskService.listArtifacts(id) };
  });

  server.post("/tasks/:id/artifacts", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const artifact = await taskService.addArtifact(
      id,
      createArtifactSchema.parse(request.body)
    );
    return reply.code(201).send({ artifact });
  });

  server.get("/tasks/:id/sessions", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { sessions: await taskService.listSessions(id) };
  });

  server.post("/tasks/:id/sessions", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const session = await taskService.addSession(
      id,
      createSessionSchema.parse(request.body)
    );
    return reply.code(201).send({ session });
  });

  server.get("/tasks/:id/tickets", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { tickets: await taskService.listTickets(id) };
  });

  server.post("/tasks/:id/tickets", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const ticket = await taskService.addTicket(id, createTicketSchema.parse(request.body));
    return reply.code(201).send({ ticket });
  });
}

function parseUpdateTaskInput(body: unknown): UpdateTaskInput {
  const parsed = updateTaskSchema.parse(body);
  return {
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
    ...(parsed.parentTaskId !== undefined ? { parentTaskId: parsed.parentTaskId } : {}),
    ...(parsed.title !== undefined ? { title: parsed.title } : {})
  };
}
