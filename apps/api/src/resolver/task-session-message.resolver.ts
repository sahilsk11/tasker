import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  parseListSessionMessagesQuery,
  parsePushSessionMessagesInput
} from "../command/task-session-message.command.js";
import type { TaskSessionMessageService } from "../service/task-session-message.service.js";

const sessionIdParamsSchema = z.object({
  sessionId: z.string().min(1)
});

// Allow batches of up to 200 messages with large text payloads (up to 256k chars each).
const PUSH_MESSAGES_BODY_LIMIT_BYTES = 16 * 1024 * 1024;

export function registerTaskSessionMessageResolver(
  server: FastifyInstance,
  sessionMessageService: TaskSessionMessageService
): void {
  server.post(
    "/sessions/:sessionId/messages",
    { bodyLimit: PUSH_MESSAGES_BODY_LIMIT_BYTES },
    async (request) => {
      const { sessionId } = sessionIdParamsSchema.parse(request.params);
      return sessionMessageService.pushMessages(
        sessionId,
        parsePushSessionMessagesInput(request.body)
      );
    }
  );

  server.get("/sessions/:sessionId/messages/head", async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    return sessionMessageService.getHead(sessionId);
  });

  server.get("/sessions/:sessionId/messages", async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const query = parseListSessionMessagesQuery(request.query);
    return sessionMessageService.listMessages(sessionId, query);
  });
}
