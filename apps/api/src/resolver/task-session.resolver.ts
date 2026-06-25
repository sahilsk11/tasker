import { agentPromptProviderValues, defaultAgentPromptProvider } from "@tasker/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { taskActionPromptValuesSchema } from "../domain/task-action-prompt-values.js";
import {
  parseClaimSessionInput,
  parseCreateSessionInput
} from "../command/task-session.command.js";
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
