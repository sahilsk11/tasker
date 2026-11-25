import { agentPromptProviderValues, defaultAgentPromptProvider } from "@tasker/core";
import { z } from "zod";
import { safeSessionUrl, type CreateTaskSessionInput, type SessionContext } from "../domain/task-session.js";
import { taskActionPromptValuesSchema } from "../domain/task-action-prompt-values.js";
import type { ClaimTaskSessionRequestInput } from "../service/task.service.js";

const contextText = z.string().trim().min(1).max(200).nullable().optional();
const sessionContextSchema = z.object({
  appName: contextText,
  clientName: contextText,
  displayTitle: contextText,
  machineName: contextText,
  sourceUrl: z.string().trim().max(2048).refine((value) => safeSessionUrl(value) !== null, {
    message: "Expected an HTTP, HTTPS, T3 or Codex session link"
  }).nullable().optional()
});

const createSessionSchema = sessionContextSchema.extend({
  actionId: z.string().min(1).nullable().optional(),
  claimed: z.boolean().default(true),
  metadata: z.record(z.unknown()).nullable().optional(),
  provider: z.string().min(1),
  providerId: z.string().min(1).nullable().optional(),
  transcriptPath: z.string().min(1).nullable().optional()
});

const claimSessionSchema = sessionContextSchema.extend({
  metadata: z.record(z.unknown()).nullable().optional(),
  provider: z.string().min(1).nullable().optional(),
  providerId: z.string().min(1).nullable().optional(),
  transcriptPath: z.string().min(1).nullable().optional()
}).passthrough();

export function parseSessionContext(body: unknown): SessionContext {
  const parsed = sessionContextSchema.strict().parse(body);
  return {
    ...(parsed.appName !== undefined ? { appName: parsed.appName } : {}),
    ...(parsed.clientName !== undefined ? { clientName: parsed.clientName } : {}),
    ...(parsed.displayTitle !== undefined ? { displayTitle: parsed.displayTitle } : {}),
    ...(parsed.machineName !== undefined ? { machineName: parsed.machineName } : {}),
    ...(parsed.sourceUrl !== undefined ? { sourceUrl: parsed.sourceUrl } : {})
  };
}

export function parseCreateSessionInput(body: unknown): CreateTaskSessionInput {
  const parsed = createSessionSchema.parse(body);
  return {
    ...parseSessionContext(sessionContextSchema.parse(parsed)),
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

export type LookupSessionsByProviderInput = {
  readonly provider: string;
  readonly providerId: string;
};

const lookupSessionsQuerySchema = z.object({
  provider: z.string().trim().min(1),
  providerId: z.string().trim().min(1)
});

export function parseLookupSessionsQuery(query: unknown): LookupSessionsByProviderInput {
  return lookupSessionsQuerySchema.parse(query ?? {});
}

export const renderSessionPromptSchema = z.object({
  provider: z.enum(agentPromptProviderValues).default(defaultAgentPromptProvider),
  promptOptions: taskActionPromptValuesSchema.optional()
});
