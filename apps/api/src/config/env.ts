export type Env = {
  readonly agentRunProvider: string;
  readonly codexSessionsRoot: string | undefined;
  readonly databasePath: string;
  readonly host: string;
  readonly kannaAgentModel: string;
  readonly kannaAgentProvider: string;
  readonly kannaBaseUrl: string;
  readonly kannaChatsLogPath: string | undefined;
  readonly kannaCodexFastMode: boolean;
  readonly kannaCodexReasoningEffort: string;
  readonly linearApiKey: string | null;
  readonly port: number;
  readonly publicApiBaseUrl: string;
  readonly taskActionsPath: string | undefined;
};

export function loadEnv(): Env {
  const host = process.env["HOST"] ?? "127.0.0.1";
  const port = Number.parseInt(process.env["PORT"] ?? "3000", 10);

  return {
    agentRunProvider:
      normalizeOptionalEnv(process.env["TASKER_AGENT_RUN_PROVIDER"]) ?? "kanna",
    codexSessionsRoot: normalizeOptionalEnv(process.env["CODEX_SESSIONS_ROOT"]) ?? undefined,
    databasePath: process.env["DATABASE_PATH"] ?? "./tasker.sqlite",
    host,
    kannaAgentModel: normalizeOptionalEnv(process.env["KANNA_AGENT_MODEL"]) ?? "gpt-5.5",
    kannaAgentProvider: normalizeOptionalEnv(process.env["KANNA_AGENT_PROVIDER"]) ?? "codex",
    kannaBaseUrl:
      normalizeOptionalEnv(process.env["KANNA_BASE_URL"]) ?? "http://127.0.0.1:3210",
    kannaChatsLogPath:
      normalizeOptionalEnv(process.env["KANNA_CHATS_LOG_PATH"]) ?? undefined,
    kannaCodexFastMode: parseBooleanEnv(process.env["KANNA_CODEX_FAST_MODE"]) ?? false,
    kannaCodexReasoningEffort:
      normalizeOptionalEnv(process.env["KANNA_CODEX_REASONING_EFFORT"]) ?? "high",
    linearApiKey: normalizeOptionalEnv(process.env["LINEAR_API_KEY"]),
    port,
    publicApiBaseUrl:
      normalizeOptionalEnv(process.env["PUBLIC_API_BASE_URL"]) ??
      `http://${host}:${String(port)}`,
    taskActionsPath: normalizeOptionalEnv(process.env["TASK_ACTIONS_PATH"]) ?? undefined
  };
}

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBooleanEnv(value: string | undefined): boolean | null {
  const normalized = normalizeOptionalEnv(value)?.toLowerCase();
  if (normalized == null) {
    return null;
  }

  return ["1", "true", "yes", "on"].includes(normalized);
}
