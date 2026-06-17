export type Env = {
  readonly codexSessionsRoot: string | undefined;
  readonly databasePath: string;
  readonly host: string;
  readonly linearApiKey: string | null;
  readonly port: number;
  readonly publicApiBaseUrl: string;
};

export function loadEnv(): Env {
  const host = process.env["HOST"] ?? "127.0.0.1";
  const port = Number.parseInt(process.env["PORT"] ?? "3000", 10);

  return {
    codexSessionsRoot: normalizeOptionalEnv(process.env["CODEX_SESSIONS_ROOT"]) ?? undefined,
    databasePath: process.env["DATABASE_PATH"] ?? "./tasker.sqlite",
    host,
    linearApiKey: normalizeOptionalEnv(process.env["LINEAR_API_KEY"]),
    port,
    publicApiBaseUrl:
      normalizeOptionalEnv(process.env["PUBLIC_API_BASE_URL"]) ??
      `http://${host}:${String(port)}`
  };
}

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
