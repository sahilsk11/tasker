import { z } from "zod";
import type { CreateTaskSessionInput } from "../domain/task-session.js";
import type { ClaimTaskSessionRequestInput } from "../service/task.service.js";

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

export function parseCreateSessionInput(body: unknown): CreateTaskSessionInput {
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

export function parseClaimSessionInput(body: unknown): ClaimTaskSessionRequestInput {
  return claimSessionSchema.parse(body) as ClaimTaskSessionRequestInput;
}
