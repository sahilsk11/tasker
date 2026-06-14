import type { TaskId } from "./task.js";
import type {
  AgentProvider,
  SessionLastTurnOutcome,
  SessionStatus
} from "./agent-provider.js";

export type TaskSessionId = string;
export type { AgentProvider } from "./agent-provider.js";

export type TaskSessionMetadata = Record<string, unknown>;

export type TaskSession = {
  readonly actionId: string | null;
  readonly claimedAt: Date | null;
  readonly createdAt: Date;
  readonly id: TaskSessionId;
  readonly lastMessageAt: Date | null;
  readonly lastTurnOutcome: SessionLastTurnOutcome;
  readonly localPath: string;
  readonly metadata: TaskSessionMetadata | null;
  readonly model: string | null;
  readonly pendingForkSessionToken: string | null;
  readonly planMode: boolean;
  readonly provider: AgentProvider;
  readonly providerId: string | null;
  readonly sessionToken: string | null;
  readonly status: SessionStatus;
  readonly taskId: TaskId;
  readonly title: string;
  readonly transcriptPath: string | null;
  readonly updatedAt: Date;
};

export type CreateTaskSessionInput = {
  readonly actionId?: string | null;
  readonly claimedAt?: Date | null;
  readonly localPath?: string;
  readonly metadata?: TaskSessionMetadata | null;
  readonly model?: string | null;
  readonly planMode?: boolean;
  readonly provider: AgentProvider;
  readonly providerId?: string | null;
  readonly title?: string | null;
  readonly transcriptPath?: string | null;
};
