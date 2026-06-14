import type {
  AgentProvider,
  ProviderSettings,
  SendMessageOptions,
  ServiceTier,
  SessionStatus
} from "./agent-provider.js";
import type { ChatAttachment } from "./chat-attachment.js";
import type { HarnessToolRequest, HarnessTurn, TaskSessionTurn } from "./task-session-turn.js";
import type { NormalizedToolCall } from "./tool-call.js";
import type { InterruptedReason, TranscriptEntry } from "./transcript-entry.js";

export type ProviderCapabilities = {
  readonly canFork: boolean;
  readonly drivesTurnViaBackgroundSession: boolean;
  readonly initialActiveStatus: Extract<SessionStatus, "running" | "starting">;
  readonly supportsPlanMode: boolean;
};

export type ProviderTurnContext = {
  readonly attachments: readonly ChatAttachment[];
  readonly clearPendingForkSessionToken: () => Promise<void>;
  readonly content: string;
  readonly effort?: string;
  readonly localPath: string;
  readonly model?: string;
  readonly onToolRequest: (request: HarnessToolRequest) => Promise<unknown>;
  readonly pendingForkSessionToken: string | null;
  readonly planMode: boolean;
  readonly serviceTier?: ServiceTier;
  readonly sessionId: string;
  readonly sessionToken: string | null;
};

export type ProviderTurnResult = {
  readonly activate?: (active: ProviderActiveTurnContext) => Promise<void>;
  readonly turn: HarnessTurn;
};

export type ProviderActiveTurnContext = {
  readonly sessionId: string;
  readonly setClaudePromptSeq: (seq: number) => void;
};

export type ProviderActiveTurnState = {
  cancelDetail?: TaskSessionTurn["cancelDetail"];
  cancelReason?: TaskSessionTurn["cancelReason"];
  cancelRecorded: TaskSessionTurn["cancelRecorded"];
  cancelRequested: TaskSessionTurn["cancelRequested"];
  claudePromptSeq?: number;
  hasFinalResult: TaskSessionTurn["hasFinalResult"];
  status: TaskSessionTurn["status"];
};

export type ProviderHost = {
  readonly appendMessage: (sessionId: string, entry: TranscriptEntry) => Promise<void>;
  readonly emitStateChange: (
    sessionId?: string,
    options?: { readonly immediate?: boolean }
  ) => void;
  readonly getActiveTurn: (sessionId: string) => ProviderActiveTurnState | undefined;
  readonly getSession: (
    sessionId: string
  ) => { readonly pendingForkSessionToken?: string | null } | null;
  readonly maybeStartNextQueuedMessage: (sessionId: string) => Promise<boolean>;
  readonly recordTurnCancelled: (
    sessionId: string,
    options: { readonly detail?: string; readonly reason: InterruptedReason }
  ) => Promise<void>;
  readonly recordTurnFailed: (sessionId: string, message: string) => Promise<void>;
  readonly recordTurnFinished: (sessionId: string) => Promise<void>;
  readonly removeActiveTurn: (sessionId: string) => void;
  readonly reportBackgroundError: (message: string) => void;
  readonly setPendingForkSessionToken: (sessionId: string, token: string | null) => Promise<void>;
  readonly setSessionToken: (sessionId: string, token: string) => Promise<void>;
  readonly updateActiveTurn: (
    sessionId: string,
    update: (active: ProviderActiveTurnState) => void
  ) => void;
};

export type ProviderAdapter = {
  readonly capabilities: ProviderCapabilities;
  readonly forkNotSupportedMessage?: () => string;
  readonly id: AgentProvider;
  readonly onCancelPendingTool?: (
    tool: NormalizedToolCall & { readonly toolKind: "ask_user_question" | "exit_plan_mode" }
  ) => "discard" | "resolve";
  readonly onExitPlanModeResponse?: (
    result: unknown
  ) => { readonly content: string; readonly planMode: boolean } | null;
  readonly resolveSettings: (options: SendMessageOptions) => ProviderSettings;
  readonly shouldSkipAccountInfo?: (sessionId: string) => boolean;
  readonly startTurn: (context: ProviderTurnContext) => Promise<ProviderTurnResult>;
  readonly stopAll: () => void;
  readonly stopChat: (sessionId: string) => void;
  readonly stopSession: (sessionId: string) => void;
};
