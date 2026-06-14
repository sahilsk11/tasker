import type { TaskId } from "./task.js";

export type TaskSessionId = string;

export type AgentProvider = "codex" | "cursor" | "opencode";

export type TaskSessionMetadata = Record<string, unknown>;

export type TaskSession = {
  readonly actionId: string | null;
  readonly claimedAt: Date | null;
  readonly createdAt: Date;
  readonly id: TaskSessionId;
  readonly metadata: TaskSessionMetadata | null;
  readonly provider: AgentProvider;
  readonly providerId: string | null;
  readonly taskId: TaskId;
  readonly transcriptPath: string | null;
};

export type CreateTaskSessionInput = {
  readonly actionId?: string | null;
  readonly claimedAt?: Date | null;
  readonly metadata?: TaskSessionMetadata | null;
  readonly provider: AgentProvider;
  readonly providerId?: string | null;
  readonly transcriptPath?: string | null;
};
