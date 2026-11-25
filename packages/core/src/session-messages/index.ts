import { z } from "zod";
export const sessionMessageRoles = ["user", "assistant"] as const;
export const SESSION_MESSAGE_MAX_TEXT_LENGTH = 256_000;
export const SESSION_MESSAGES_MAX_PER_PUSH = 200;
export const sessionMessageSchema = z.object({
  externalId: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  role: z.enum(sessionMessageRoles),
  text: z.string().min(1).max(SESSION_MESSAGE_MAX_TEXT_LENGTH),
  occurredAt: z.string().datetime({ offset: true }).nullable().optional()
});
export type SessionMessage = z.infer<typeof sessionMessageSchema>;
export const pushSessionMessagesRequestSchema = z.object({
  messages: z.array(sessionMessageSchema).min(1).max(SESSION_MESSAGES_MAX_PER_PUSH)
});
export type PushSessionMessagesRequest = z.infer<typeof pushSessionMessagesRequestSchema>;
