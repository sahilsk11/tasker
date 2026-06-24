import { agentPromptProviderValues, defaultAgentPromptProvider } from "@tasker/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { taskActionOptionsSchema } from "../domain/task-action-options.js";
import { taskActionPromptValuesSchema } from "../domain/task-action-prompt-values.js";
import type {
  ClaimTaskSessionInput,
  CreateTaskSessionInput,
  TaskSessionMetadata
} from "../domain/task-session.js";
import type { CreateTaskArtifactInput } from "../domain/task-artifact.js";
import type { CreateTaskPullRequestInput } from "../domain/task-pull-request.js";
import type { CreateTaskTicketInput } from "../domain/task-ticket.js";
import type { UpdateTaskActionInput } from "../domain/task-action.js";
import { taskStateDefinitions, taskStates } from "../domain/task.js";
import type { CreateTaskInput, UpdateTaskInput } from "../domain/task.js";
import type { TaskService } from "../service/task.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
});

const listTasksQuerySchema = z.object({
  parentTaskId: z.string().min(1).optional()
});

const actionIdParamsSchema = z.object({
  actionId: z.string().min(1)
});

const artifactIdParamsSchema = taskIdParamsSchema.extend({
  artifactId: z.string().min(1)
});

const sessionIdParamsSchema = z.object({
  sessionId: z.string().min(1)
});

const taskSessionParamsSchema = taskIdParamsSchema.extend({
  sessionId: z.string().min(1)
});

const renderSessionPromptSchema = z.object({
  provider: z.enum(agentPromptProviderValues).default(defaultAgentPromptProvider),
  promptOptions: taskActionPromptValuesSchema.optional()
});

const runSessionPromptSchema = z.object({
  agentProvider: z.enum(agentPromptProviderValues).nullable().optional(),
  prompt: z.string().min(1),
  provider: z.string().min(1).nullable().optional(),
  workingPath: z.string().min(1)
});

const createTaskSchema = z.object({
  description: z.string().nullable().default(null),
  parentTaskId: z.string().nullable().default(null),
  title: z.string().min(1),
  workingDirectory: z.string().nullable().optional()
});

const updateTaskSchema = z.object({
  description: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  state: z.enum(taskStates).optional(),
  title: z.string().min(1).optional(),
  workingDirectory: z.string().nullable().optional()
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

const createArtifactSchema = z.object({
  createdBySessionId: z.string().min(1).nullable().optional(),
  label: z.enum(["research", "plan", "implement", "other"]),
  uri: z.string().min(1)
});

const listArtifactsQuerySchema = z.object({
  includeArchived: z
    .enum(["false", "true"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true"))
});

const createPullRequestSchema = z.object({
  url: z.string().url()
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
  server.get("/tasks", async (request) => {
    const { parentTaskId } = listTasksQuerySchema.parse(request.query);
    return {
      tasks: await taskService.listTasks({ parentTaskId: parentTaskId ?? null })
    };
  });

  server.get("/actions", async () => ({
    actions: await taskService.listActionSettings()
  }));

  server.get("/task-states", () => ({
    states: taskStateDefinitions
  }));

  server.patch("/actions/:actionId", async (request) => {
    const { actionId } = actionIdParamsSchema.parse(request.params);
    const action = await taskService.updateActionSettings(
      actionId,
      parseUpdateTaskActionInput(request.body)
    );
    return { action };
  });

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
    const { includeArchived } = listArtifactsQuerySchema.parse(request.query);
    return {
      artifacts: await taskService.listArtifacts(id, {
        ...(includeArchived === undefined ? {} : { includeArchived })
      })
    };
  });

  server.get("/tasks/:id/artifacts/:artifactId", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { artifact: await taskService.getArtifact(id, artifactId) };
  });

  server.get("/tasks/:id/artifacts/:artifactId/content", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { content: await taskService.getArtifactContent(id, artifactId) };
  });

  server.post("/tasks/:id/artifacts", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const artifact = await taskService.addArtifact(
      id,
      parseCreateArtifactInput(request.body)
    );
    return reply.code(201).send({ artifact });
  });

  server.post("/tasks/:id/artifacts/:artifactId/archive", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { artifact: await taskService.archiveArtifact(id, artifactId) };
  });

  server.post("/tasks/:id/artifacts/:artifactId/restore", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { artifact: await taskService.restoreArtifact(id, artifactId) };
  });

  server.delete("/tasks/:id/artifacts/:artifactId", async (request) => {
    const { artifactId, id } = artifactIdParamsSchema.parse(request.params);
    return { artifact: await taskService.deleteArtifact(id, artifactId) };
  });

  server.get("/tasks/:id/pull-requests", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { pullRequests: await taskService.listPullRequests(id) };
  });

  server.post("/tasks/:id/pull-requests", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const pullRequest = await taskService.addPullRequest(
      id,
      parseCreatePullRequestInput(request.body)
    );
    return reply.code(201).send({ pullRequest });
  });

  server.get("/tasks/:id/sessions", async (request) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    return { sessions: await taskService.listSessions(id) };
  });

  server.post("/tasks/:id/sessions", async (request, reply) => {
    const { id } = taskIdParamsSchema.parse(request.params);
    const session = await taskService.addSession(id, parseCreateSessionInput(request.body));
    return reply.code(201).send({ session });
  });

  server.post("/tasks/:id/sessions/:sessionId/prompt", async (request) => {
    const { id, sessionId } = taskSessionParamsSchema.parse(request.params);
    const parsed = renderSessionPromptSchema.parse(request.body ?? {});
    const prompt = await taskService.renderSessionPrompt(
      id,
      sessionId,
      parsed.promptOptions,
      parsed.provider
    );
    return { prompt };
  });

  server.post("/tasks/:id/sessions/:sessionId/run", async (request) => {
    const { id, sessionId } = taskSessionParamsSchema.parse(request.params);
    const parsed = runSessionPromptSchema.parse(request.body);
    return taskService.runSessionPrompt(id, sessionId, {
      ...(parsed.agentProvider !== undefined
        ? { agentProvider: parsed.agentProvider }
        : {}),
      prompt: parsed.prompt,
      ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
      workingPath: parsed.workingPath
    });
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
    const ticket = await taskService.addTicket(id, parseCreateTicketInput(request.body));
    return reply.code(201).send({ ticket });
  });
}

function parseCreateArtifactInput(body: unknown): CreateTaskArtifactInput {
  const parsed = createArtifactSchema.parse(body);
  return {
    ...(parsed.createdBySessionId !== undefined
      ? { createdBySessionId: parsed.createdBySessionId }
      : {}),
    label: parsed.label,
    uri: parsed.uri
  };
}

function parseCreateTaskInput(body: unknown): CreateTaskInput {
  const parsed = createTaskSchema.parse(body);
  return {
    description: parsed.description,
    parentTaskId: parsed.parentTaskId,
    title: parsed.title,
    ...(parsed.workingDirectory !== undefined
      ? { workingDirectory: normalizeOptionalPath(parsed.workingDirectory) }
      : {})
  };
}

function parseCreatePullRequestInput(body: unknown): CreateTaskPullRequestInput {
  return createPullRequestSchema.parse(body);
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

function parseCreateTicketInput(body: unknown): CreateTaskTicketInput {
  const parsed = createTicketSchema.parse(body);
  return {
    externalId: parsed.externalId,
    url: parsed.url
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
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...(parsed.title !== undefined ? { title: parsed.title } : {}),
    ...(parsed.workingDirectory !== undefined
      ? { workingDirectory: normalizeOptionalPath(parsed.workingDirectory) }
      : {})
  };
}

function normalizeOptionalPath(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed == null || trimmed.length === 0 ? null : trimmed;
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
