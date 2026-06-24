import { z } from "zod";
import type { CreateTaskArtifactInput } from "../domain/task-artifact.js";
import type { CreateTaskPullRequestInput } from "../domain/task-pull-request.js";
import type { CreateTaskTicketInput } from "../domain/task-ticket.js";

const createArtifactSchema = z.object({
  createdBySessionId: z.string().min(1).nullable().optional(),
  label: z.enum(["research", "plan", "implement", "other"]),
  uri: z.string().min(1)
});

const createPullRequestSchema = z.object({
  url: z.string().url()
});

const createTicketSchema = z.object({
  externalId: z.string().min(1),
  url: z.string().url().nullable().default(null)
});

export function parseCreateArtifactInput(body: unknown): CreateTaskArtifactInput {
  const parsed = createArtifactSchema.parse(body);
  return {
    ...(parsed.createdBySessionId !== undefined
      ? { createdBySessionId: parsed.createdBySessionId }
      : {}),
    label: parsed.label,
    uri: parsed.uri
  };
}

export function parseCreatePullRequestInput(body: unknown): CreateTaskPullRequestInput {
  return createPullRequestSchema.parse(body);
}

export function parseCreateTicketInput(body: unknown): CreateTaskTicketInput {
  const parsed = createTicketSchema.parse(body);
  return {
    externalId: parsed.externalId,
    url: parsed.url
  };
}
