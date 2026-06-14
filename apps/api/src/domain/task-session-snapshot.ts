import type {
  AgentProvider,
  ProviderSettings,
  SessionStatus
} from "./agent-provider.js";
import type { QueuedSessionMessage } from "./task-session-turn.js";
import type { TranscriptEntry } from "./transcript-entry.js";

export type ProviderCatalogEntry = {
  readonly available: boolean;
  readonly defaultSettings: ProviderSettings;
  readonly id: AgentProvider;
  readonly label: string;
  readonly warning?: string | null;
};

export type TaskSessionRuntime = {
  readonly isDraining: boolean;
  readonly localPath: string;
  readonly planMode: boolean;
  readonly provider: AgentProvider | null;
  readonly sessionId: string;
  readonly sessionToken: string | null;
  readonly status: SessionStatus;
  readonly taskId: string;
  readonly title: string;
};

export type TaskSessionHistorySnapshot = {
  readonly hasOlder: boolean;
  readonly olderCursor: string | null;
  readonly recentLimit: number;
};

export type TaskSessionSnapshot = {
  readonly availableProviders: readonly ProviderCatalogEntry[];
  readonly history: TaskSessionHistorySnapshot;
  readonly messages: readonly TranscriptEntry[];
  readonly queuedMessages: readonly QueuedSessionMessage[];
  readonly runtime: TaskSessionRuntime;
};

export type PendingToolSnapshot = {
  readonly toolKind: "ask_user_question" | "exit_plan_mode";
  readonly toolUseId: string;
};
