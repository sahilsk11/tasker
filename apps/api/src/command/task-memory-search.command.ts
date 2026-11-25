import { z } from "zod";
import type { TaskMemorySearchInput } from "../domain/task-memory-search.js";

const searchQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, context) => {
      if (value === undefined) {
        return 12;
      }
      const limit = typeof value === "number" ? value : Number(value);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Limit must be an integer from 1 to 20"
        });
        return z.NEVER;
      }
      return limit;
    }),
  q: z
    .string()
    .trim()
    .min(1, "Query is required")
    .max(240, "Query must be 240 characters or fewer")
});

export function parseTaskMemorySearchQuery(query: unknown): TaskMemorySearchInput {
  const parsed = searchQuerySchema.parse(query ?? {});
  return { limit: parsed.limit, query: parsed.q };
}
