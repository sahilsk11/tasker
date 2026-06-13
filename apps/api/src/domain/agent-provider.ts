export type AgentProvider = "claude" | "codex" | "cursor" | "opencode";

export type SessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "waiting_for_user"
  | "failed";

export type SessionLastTurnOutcome = "cancelled" | "failed" | "success" | null;

export type ClaudeReasoningEffort = "low" | "medium" | "high" | "max";
export type CodexReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type ClaudeContextWindow = "200k" | "1m";
export type ServiceTier = "fast";

export type ClaudeModelOptions = {
  readonly contextWindow: ClaudeContextWindow;
  readonly reasoningEffort: ClaudeReasoningEffort;
};

export type CodexModelOptions = {
  readonly fastMode: boolean;
  readonly reasoningEffort: CodexReasoningEffort;
};

export type CursorModelOptions = Record<string, never>;
export type OpenCodeModelOptions = Record<string, never>;

export type ProviderModelOptionsByProvider = {
  readonly claude: ClaudeModelOptions;
  readonly codex: CodexModelOptions;
  readonly cursor: CursorModelOptions;
  readonly opencode: OpenCodeModelOptions;
};

export type ModelOptions = Partial<{
  readonly [Provider in AgentProvider]: Partial<ProviderModelOptionsByProvider[Provider]>;
}>;

export type SendMessageOptions = {
  readonly effort?: string;
  readonly model?: string;
  readonly modelOptions?: ModelOptions;
  readonly planMode?: boolean;
  readonly provider?: AgentProvider;
};

export type ProviderSettings = {
  readonly effort?: string;
  readonly model: string;
  readonly planMode: boolean;
  readonly serviceTier?: ServiceTier;
};
