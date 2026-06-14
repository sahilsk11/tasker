import type { ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { TaskSessionChatSnapshot } from "../domain/task-session-chat.js";
import type { UpdateTaskInput } from "../domain/task.js";
import type { TranscriptEntry } from "../domain/transcript-entry.js";
import type {
  TaskSessionCoordinator,
  TaskSessionStreamEvent,
  TaskSessionStreamSubscription
} from "../service/task-session-coordinator.js";
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
  localPath: z.string().default(""),
  model: z.string().nullable().default(null),
  planMode: z.boolean().default(false),
  provider: z.enum(["claude", "codex", "cursor", "opencode"]),
  title: z.string().nullable().default(null)
});

const transcriptEntrySchema = z.object({
  _id: z.string().min(1),
  createdAt: z.number().finite(),
  hidden: z.boolean().optional(),
  kind: z.string().min(1),
  messageId: z.string().optional()
}).passthrough();

const createTicketSchema = z.object({
  externalId: z.string().min(1),
  url: z.string().url().nullable().default(null)
});

const sendSessionMessageSchema = z.object({
  content: z.string().min(1)
});

export function registerTaskResolver(
  server: FastifyInstance,
  taskService: TaskService,
  taskSessionCoordinator: TaskSessionCoordinator
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

  server.get("/sessions/:sessionId/transcript", async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    return {
      entries: await taskService.listSessionTranscriptEntries(sessionId)
    };
  });

  server.get("/sessions/:sessionId/chat", async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    return { snapshot: await taskService.getSessionChatSnapshot(sessionId) };
  });

  server.get("/sessions/:sessionId/events", async (request, reply) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    await taskService.listSessionTranscriptEntries(sessionId);

    const subscription = taskSessionCoordinator.subscribe(sessionId);
    reply.hijack();
    reply.raw.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no"
    });
    reply.raw.write("retry: 1000\n\n");

    request.raw.on("close", () => {
      subscription.close();
    });
    void streamSessionEvents(reply.raw, subscription);
  });

  server.get("/sessions/:sessionId/chat/events", async (request, reply) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    await taskService.listSessionTranscriptEntries(sessionId);

    const subscription = taskSessionCoordinator.subscribe(sessionId);
    reply.hijack();
    reply.raw.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no"
    });
    reply.raw.write("retry: 1000\n\n");
    writeChatSnapshotEvent(
      reply.raw,
      await taskService.getSessionChatSnapshot(sessionId)
    );

    request.raw.on("close", () => {
      subscription.close();
    });
    void streamSessionChatEvents(reply.raw, subscription, taskService);
  });

  server.post("/sessions/:sessionId/transcript", async (request, reply) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const entry = await taskService.appendSessionTranscriptEntry(
      sessionId,
      transcriptEntrySchema.parse(request.body) as TranscriptEntry
    );
    return reply.code(201).send({ entry });
  });

  server.post("/sessions/:sessionId/messages", async (request, reply) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const result = await taskSessionCoordinator.sendMessage(
      sessionId,
      sendSessionMessageSchema.parse(request.body)
    );
    return reply.code(202).send(result);
  });

  server.post("/sessions/:sessionId/runs", async (request, reply) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const result = await taskSessionCoordinator.sendMessage(
      sessionId,
      sendSessionMessageSchema.parse(request.body)
    );
    return reply.code(202).send(result);
  });

  server.post("/sessions/:sessionId/cancel", async (request, reply) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const result = await taskSessionCoordinator.cancelTurn(sessionId);
    return reply.code(202).send(result);
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

async function streamSessionEvents(
  response: ServerResponse,
  subscription: TaskSessionStreamSubscription
): Promise<void> {
  try {
    for await (const event of subscription.events) {
      if (response.writableEnded) {
        break;
      }
      writeSessionEvent(response, event);
    }
  } finally {
    subscription.close();
    if (!response.writableEnded) {
      response.end();
    }
  }
}

async function streamSessionChatEvents(
  response: ServerResponse,
  subscription: TaskSessionStreamSubscription,
  taskService: TaskService
): Promise<void> {
  try {
    for await (const event of subscription.events) {
      if (response.writableEnded) {
        break;
      }

      writeChatSnapshotEvent(
        response,
        await taskService.getSessionChatSnapshot(event.sessionId)
      );
    }
  } finally {
    subscription.close();
    if (!response.writableEnded) {
      response.end();
    }
  }
}

function writeSessionEvent(
  response: ServerResponse,
  event: TaskSessionStreamEvent
): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeChatSnapshotEvent(
  response: ServerResponse,
  snapshot: TaskSessionChatSnapshot
): void {
  response.write("event: chat_snapshot\n");
  response.write(`data: ${JSON.stringify({
    sessionId: snapshot.sessionId,
    snapshot,
    type: "chat_snapshot"
  })}\n\n`);
}
