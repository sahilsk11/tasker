import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { TaskBreakdown, TaskBreakdownSourceInput } from "../domain/task-breakdown.js";
import type { TaskBreakdownService } from "../service/task-breakdown.service.js";

const sourceInputSchema = z
  .object({
    breakdown: z.unknown().optional(),
    uri: z.string().min(1).optional()
  })
  .refine((input) => input.breakdown != null || input.uri != null, {
    message: "Provide either breakdown or uri."
  })
  .refine((input) => input.breakdown == null || input.uri == null, {
    message: "Provide only one of breakdown or uri."
  });

export function registerTaskBreakdownResolver(
  server: FastifyInstance,
  breakdownService: TaskBreakdownService
): void {
  server.post("/breakdowns/validate", async (request) => {
    return breakdownService.validate(parseSourceInput(request.body));
  });

  server.post("/breakdowns/accept", async (request, reply) => {
    const result = await breakdownService.accept(parseSourceInput(request.body));
    return reply.code(201).send(result);
  });
}

function parseSourceInput(body: unknown): TaskBreakdownSourceInput {
  const parsed = sourceInputSchema.parse(body);
  if (parsed.breakdown != null) {
    return { breakdown: parsed.breakdown as TaskBreakdown };
  }

  return { uri: parsed.uri ?? "" };
}
