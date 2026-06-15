import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  ClaimTaskSessionInput,
  CreateTaskSessionInput,
  TaskSessionMetadata
} from "../domain/task-session.js";
import type { UpdateTaskInput } from "../domain/task.js";
import type { TaskService } from "../service/task.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
});

const sessionIdParamsSchema = z.object({
  sessionId: z.string().min(1)
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
  actionId: z.string().min(1).nullable().optional(),
  claimed: z.boolean().default(true),
  metadata: z.record(z.unknown()).nullable().optional(),
  provider: z.string().min(1),
  providerId: z.string().min(1).nullable().optional(),
  transcriptPath: z.string().min(1).nullable().optional()
});

const claimSessionSchema = z.object({
  metadata: z.record(z.unknown()).nullable().optional(),
  provider: z.string().min(1).nullable().optional(),
  providerId: z.string().min(1).nullable().optional(),
  transcriptPath: z.string().min(1).nullable().optional()
}).passthrough();

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

  server.post("/tasks/:id/resources", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const resource = await taskService.addResource(
      id,
      createArtifactSchema.parse(request.body)
    );
    return reply.code(201).send({ resource });
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
      parseCreateSessionInput(request.body)
    );
    return reply.code(201).send({ session });
  });

  server.post("/sessions/:sessionId/claim", async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const claimedSession = await taskService.claimSession(
      sessionId,
      parseClaimSessionInput(request.body)
    );
    return claimedSession;
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

function parseCreateSessionInput(body: unknown): CreateTaskSessionInput {
  const parsed = createSessionSchema.parse(body);
  return {
    ...(parsed.actionId !== undefined ? { actionId: parsed.actionId } : {}),
    ...(parsed.claimed ? {} : { claimedAt: null }),
    ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
    provider: parsed.provider,
    ...(parsed.providerId !== undefined ? { providerId: parsed.providerId } : {}),
    ...(parsed.transcriptPath !== undefined
      ? { transcriptPath: parsed.transcriptPath }
      : {})
  };
}

function parseClaimSessionInput(body: unknown): ClaimTaskSessionInput {
  const parsed = claimSessionSchema.parse(body);
  const metadata = mergeClaimMetadata(parsed);

  return {
    ...(metadata !== undefined ? { metadata } : {}),
    ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
    ...(parsed.providerId !== undefined ? { providerId: parsed.providerId } : {}),
    ...(parsed.transcriptPath !== undefined
      ? { transcriptPath: parsed.transcriptPath }
      : {})
  };
}

function mergeClaimMetadata(
  parsed: z.infer<typeof claimSessionSchema>
): TaskSessionMetadata | null | undefined {
  const extraMetadata = getExtraClaimMetadata(parsed);
  if (parsed.metadata === undefined) {
    return Object.keys(extraMetadata).length === 0 ? undefined : extraMetadata;
  }

  return {
    ...(parsed.metadata ?? {}),
    ...extraMetadata
  };
}

function getExtraClaimMetadata(
  parsed: z.infer<typeof claimSessionSchema>
): TaskSessionMetadata {
  const reservedKeys = new Set(["metadata", "provider", "providerId", "transcriptPath"]);
  return Object.fromEntries(
    Object.entries(parsed).filter(([key]) => !reservedKeys.has(key))
  );
}

function parseUpdateTaskInput(body: unknown): UpdateTaskInput {
  const parsed = updateTaskSchema.parse(body);
  return {
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
    ...(parsed.parentTaskId !== undefined ? { parentTaskId: parsed.parentTaskId } : {}),
    ...(parsed.title !== undefined ? { title: parsed.title } : {})
  };
}
