import type {
  AgentProvider,
  ModelOptions,
  ServiceTier,
  SessionStatus
} from "./agent-provider.js";
import type { ChatAttachment } from "./chat-attachment.js";
import type { PendingUserToolCall } from "./tool-call.js";
import type { AccountInfo, InterruptedReason, TranscriptEntry } from "./transcript-entry.js";

export type TaskSessionTurnId = string;

export type HarnessEvent =
  | {
      readonly entry: TranscriptEntry;
      readonly type: "transcript";
    }
  | {
      readonly sessionToken: string;
      readonly type: "session_token";
    };

export type HarnessToolRequest = {
  readonly tool: PendingUserToolCall;
};

export type HarnessTurn = {
  readonly close: () => void;
  readonly getAccountInfo?: () => Promise<AccountInfo | null>;
  readonly interrupt: () => Promise<void>;
  readonly provider: AgentProvider;
  readonly stream: AsyncIterable<HarnessEvent>;
};

export type PendingToolRequest = {
  readonly resolve: (result: unknown) => void;
  readonly tool: PendingUserToolCall;
  readonly toolUseId: string;
};

export type TaskSessionTurn = {
  readonly cancelDetail?: string;
  readonly cancelReason?: InterruptedReason;
  readonly cancelRecorded: boolean;
  readonly cancelRequested: boolean;
  readonly hasFinalResult: boolean;
  readonly id: TaskSessionTurnId;
  readonly model: string;
  readonly pendingTool: PendingToolRequest | null;
  readonly planMode: boolean;
  readonly provider: AgentProvider;
  readonly serviceTier?: ServiceTier;
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly turn: HarnessTurn;
};

export type QueuedSessionMessage = {
  readonly attachments: readonly ChatAttachment[];
  readonly content: string;
  readonly createdAt: number;
  readonly id: string;
  readonly model?: string;
  readonly modelOptions?: ModelOptions;
  readonly planMode?: boolean;
  readonly provider?: AgentProvider;
};
