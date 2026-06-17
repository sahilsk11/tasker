export type Env = {
  readonly codexSessionsRoot: string | undefined;
  readonly databasePath: string;
  readonly host: string;
  readonly linearApiKey: string | null;
  readonly port: number;
};

export function loadEnv(): Env {
  return {
    codexSessionsRoot: normalizeOptionalEnv(process.env["CODEX_SESSIONS_ROOT"]) ?? undefined,
    databasePath: process.env["DATABASE_PATH"] ?? "./tasker.sqlite",
    host: process.env["HOST"] ?? "127.0.0.1",
    linearApiKey: normalizeOptionalEnv(process.env["LINEAR_API_KEY"]),
    port: Number.parseInt(process.env["PORT"] ?? "3000", 10)
  };
}

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
