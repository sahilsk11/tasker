import {
  pushSessionMessagesRequestSchema,
  type PushSessionMessagesRequest
} from "@tasker/core";
import { z } from "zod";
import type { ListTaskSessionMessagesOptions } from "../domain/task-session-message.js";

export const DEFAULT_SESSION_MESSAGES_LIMIT = 200;
export const MAX_SESSION_MESSAGES_LIMIT = 500;

const integerQueryParamSchema = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    if (typeof value === "number") {
      if (!Number.isInteger(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Expected an integer"
        });
        return z.NEVER;
      }
      return value;
    }

    const trimmed = value.trim();
    if (!/^-?\d+$/u.test(trimmed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected an integer"
      });
      return z.NEVER;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected a safe integer"
      });
      return z.NEVER;
    }

    return parsed;
  });

const listSessionMessagesQuerySchema = z.object({
  after: integerQueryParamSchema.pipe(z.number().int().nonnegative()).optional(),
  limit: integerQueryParamSchema
    .pipe(z.number().int().min(1).max(MAX_SESSION_MESSAGES_LIMIT))
    .optional()
});

export function parsePushSessionMessagesInput(
  body: unknown
): PushSessionMessagesRequest {
  return pushSessionMessagesRequestSchema.parse(body);
}

export function parseListSessionMessagesQuery(
  query: unknown
): ListTaskSessionMessagesOptions {
  const parsed = listSessionMessagesQuerySchema.parse(query ?? {});
  return {
    ...(parsed.after !== undefined ? { after: parsed.after } : {}),
    ...(parsed.limit !== undefined ? { limit: parsed.limit } : {})
  };
}
