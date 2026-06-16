import type { TaskId } from "./task.js";
import type { TaskActionPromptValues } from "./task-action-prompt-values.js";

export type TaskSessionId = string;

export type SessionProvider = string;

export type TaskSessionMetadata = Record<string, unknown>;

export type TaskSession = {
  readonly actionId: string | null;
  readonly claimedAt: Date | null;
  readonly createdAt: Date;
  readonly id: TaskSessionId;
  readonly metadata: TaskSessionMetadata | null;
  readonly provider: SessionProvider;
  readonly providerId: string | null;
  readonly taskId: TaskId;
  readonly transcriptPath: string | null;
};

export type CreateTaskSessionInput = {
  readonly actionId?: string | null;
  readonly claimedAt?: Date | null;
  readonly metadata?: TaskSessionMetadata | null;
  readonly options?: TaskActionPromptValues;
  readonly provider: SessionProvider;
  readonly providerId?: string | null;
  readonly transcriptPath?: string | null;
};

export type ClaimTaskSessionInput = {
  readonly metadata?: TaskSessionMetadata | null;
  readonly provider?: SessionProvider | null;
  readonly providerId?: string | null;
  readonly transcriptPath?: string | null;
};
