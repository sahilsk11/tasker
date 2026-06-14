import type { TaskId } from "./task.js";
import type {
  AgentProvider,
  SessionLastTurnOutcome,
  SessionStatus
} from "./agent-provider.js";

export type TaskSessionId = string;
export type { AgentProvider } from "./agent-provider.js";

export type TaskSession = {
  readonly createdAt: Date;
  readonly id: TaskSessionId;
  readonly lastMessageAt: Date | null;
  readonly lastTurnOutcome: SessionLastTurnOutcome;
  readonly localPath: string;
  readonly model: string | null;
  readonly pendingForkSessionToken: string | null;
  readonly planMode: boolean;
  readonly provider: AgentProvider;
  readonly sessionToken: string | null;
  readonly status: SessionStatus;
  readonly taskId: TaskId;
  readonly title: string;
  readonly updatedAt: Date;
};

export type CreateTaskSessionInput = {
  readonly localPath?: string;
  readonly model?: string | null;
  readonly planMode?: boolean;
  readonly provider: AgentProvider;
  readonly title?: string | null;
};
