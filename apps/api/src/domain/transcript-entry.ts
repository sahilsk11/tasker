import type { AgentProvider } from "./agent-provider.js";
import type { ChatAttachment } from "./chat-attachment.js";
import type { NormalizedToolCall } from "./tool-call.js";

export type TranscriptEntryId = string;

export type McpServerInfo = {
  readonly error?: string;
  readonly name: string;
  readonly status: string;
};

export type AccountInfo = {
  readonly apiKeySource?: string;
  readonly email?: string;
  readonly organization?: string;
  readonly subscriptionType?: string;
  readonly tokenSource?: string;
};

export type TranscriptEntryBase = {
  readonly _id: TranscriptEntryId;
  readonly createdAt: number;
  readonly debugRaw?: string;
  readonly hidden?: boolean;
  readonly messageId?: string;
};

export type UserPromptEntry = TranscriptEntryBase & {
  readonly attachments?: readonly ChatAttachment[];
  readonly content: string;
  readonly kind: "user_prompt";
  readonly steered?: boolean;
};

export type SystemInitEntry = TranscriptEntryBase & {
  readonly agents: readonly string[];
  readonly kind: "system_init";
  readonly mcpServers: readonly McpServerInfo[];
  readonly model: string;
  readonly provider: AgentProvider;
  readonly slashCommands: readonly string[];
  readonly tools: readonly string[];
};

export type AccountInfoEntry = TranscriptEntryBase & {
  readonly accountInfo: AccountInfo;
  readonly kind: "account_info";
};

export type AssistantTextEntry = TranscriptEntryBase & {
  readonly kind: "assistant_text";
  readonly text: string;
};

export type ToolCallEntry = TranscriptEntryBase & {
  readonly kind: "tool_call";
  readonly tool: NormalizedToolCall;
};

export type ToolResultEntry = TranscriptEntryBase & {
  readonly content: unknown;
  readonly isError?: boolean;
  readonly kind: "tool_result";
  readonly toolId: string;
};

export type ResultEntry = TranscriptEntryBase & {
  readonly costUsd?: number;
  readonly durationMs: number;
  readonly isError: boolean;
  readonly kind: "result";
  readonly result: string;
  readonly subtype: "cancelled" | "error" | "success";
};

export type StatusEntry = TranscriptEntryBase & {
  readonly kind: "status";
  readonly status: string;
};

export type ContextWindowUsageSnapshot = {
  readonly cachedInputTokens?: number;
  readonly compactsAutomatically: boolean;
  readonly durationMs?: number;
  readonly inputTokens?: number;
  readonly lastCachedInputTokens?: number;
  readonly lastInputTokens?: number;
  readonly lastOutputTokens?: number;
  readonly lastReasoningOutputTokens?: number;
  readonly lastUsedTokens?: number;
  readonly maxTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningOutputTokens?: number;
  readonly toolUses?: number;
  readonly totalProcessedTokens?: number;
  readonly usedTokens: number;
};

export type ContextWindowUpdatedEntry = TranscriptEntryBase & {
  readonly kind: "context_window_updated";
  readonly usage: ContextWindowUsageSnapshot;
};

export type CompactBoundaryEntry = TranscriptEntryBase & {
  readonly kind: "compact_boundary";
};

export type CompactSummaryEntry = TranscriptEntryBase & {
  readonly kind: "compact_summary";
  readonly summary: string;
};

export type ContextClearedEntry = TranscriptEntryBase & {
  readonly kind: "context_cleared";
};

export type InterruptedReason =
  | "chat_deleted"
  | "provider_reported_cancelled"
  | "server_shutdown"
  | "steer_replaced_turn"
  | "unknown"
  | "user_cancelled";

export type InterruptedEntry = TranscriptEntryBase & {
  readonly detail?: string;
  readonly kind: "interrupted";
  readonly reason?: InterruptedReason;
};

export type TranscriptEntry =
  | AccountInfoEntry
  | AssistantTextEntry
  | CompactBoundaryEntry
  | CompactSummaryEntry
  | ContextClearedEntry
  | ContextWindowUpdatedEntry
  | InterruptedEntry
  | ResultEntry
  | StatusEntry
  | SystemInitEntry
  | ToolCallEntry
  | ToolResultEntry
  | UserPromptEntry;
