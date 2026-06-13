import { z } from "zod";

export const taskStatusSchema = z.enum([
  "queued",
  "running",
  "blocked_needs_approval",
  "needs_review",
  "failed",
  "cancelled",
  "completed"
]);

export const agentProviderSchema = z.enum(["codex", "opencode", "cursor"]);

export const artifactKindSchema = z.enum([
  "diff",
  "file",
  "log",
  "screenshot",
  "summary",
  "pr"
]);

export const createTaskSchema = z.object({
  provider: agentProviderSchema.default("codex"),
  prompt: z.string().min(1).max(20_000),
  repositoryUrl: z.string().url().optional(),
  title: z.string().min(1).max(200)
});

export const taskSchema = createTaskSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  status: taskStatusSchema,
  updatedAt: z.string().datetime()
});

export const runEventSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  message: z.string(),
  taskId: z.string().uuid(),
  type: z.enum(["status", "stdout", "stderr", "artifact", "error"])
});

export const artifactSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  kind: artifactKindSchema,
  label: z.string().min(1),
  taskId: z.string().uuid(),
  url: z.string()
});

export type AgentProvider = z.infer<typeof agentProviderSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type ArtifactKind = z.infer<typeof artifactKindSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type RunEvent = z.infer<typeof runEventSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;

