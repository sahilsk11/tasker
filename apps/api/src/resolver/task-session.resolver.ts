import { agentPromptProviderValues, defaultAgentPromptProvider } from "@tasker/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { taskActionPromptValuesSchema } from "../domain/task-action-prompt-values.js";
import type { ClaimTaskSessionRequestInput } from "../service/task.service.js";
import type { CreateTaskSessionInput } from "../domain/task-session.js";
import type { TaskService } from "../service/task.service.js";

const taskIdParamsSchema = z.object({
  id: z.string().min(1)
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

const createSessionSchema = z.object({
  actionId: z.string().min(1).nullable().optional(),
  claimed: z.boolean().default(true),
  metadata: z.record(z.unknown()).nullable().optional(),
  provider: z.string().min(1),
  providerId: z.string().min(1).nullable().optional(),
  transcriptPath: z.string().min(1).nullable().optional()
});

const claimSessionSchema = z
  .object({
    metadata: z.record(z.unknown()).nullable().optional(),
    provider: z.string().min(1).nullable().optional(),
    providerId: z.string().min(1).nullable().optional(),
    transcriptPath: z.string().min(1).nullable().optional()
  })
  .passthrough();

export function registerTaskSessionResolver(
  server: FastifyInstance,
  taskService: TaskService
): void {
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
    return taskService.claimSession(sessionId, parseClaimSessionInput(request.body));
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

function parseClaimSessionInput(body: unknown): ClaimTaskSessionRequestInput {
  return claimSessionSchema.parse(body) as ClaimTaskSessionRequestInput;
}
