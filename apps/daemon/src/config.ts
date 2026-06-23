import { resolve } from "node:path";

export type DaemonEnv = {
  readonly artifactArchiveRoot: string | undefined;
  readonly artifactRoot: string | undefined;
  readonly codexSessionsRoot: string | undefined;
  readonly databasePath: string;
  readonly host: string;
  readonly linearApiKey: string | null;
  readonly migrationsDirectory: string | undefined;
  readonly port: number;
  readonly webDistDirectory: string;
};

export function loadDaemonEnv(): DaemonEnv {
  return {
    artifactArchiveRoot:
      normalizeOptionalEnv(process.env["TASKER_ARTIFACT_ARCHIVE_ROOT"]) ?? undefined,
    artifactRoot: normalizeOptionalEnv(process.env["TASKER_ARTIFACT_ROOT"]) ?? undefined,
    codexSessionsRoot: normalizeOptionalEnv(process.env["CODEX_SESSIONS_ROOT"]) ?? undefined,
    databasePath: process.env["DATABASE_PATH"] ?? "./tasker.sqlite",
    host: process.env["HOST"] ?? "127.0.0.1",
    linearApiKey: normalizeOptionalEnv(process.env["LINEAR_API_KEY"]),
    migrationsDirectory:
      normalizeOptionalEnv(process.env["TASKER_MIGRATIONS_DIR"]) ?? undefined,
    port: parsePort(process.env["PORT"] ?? "48273"),
    webDistDirectory: resolve(process.env["TASKER_WEB_DIST_DIR"] ?? "./web")
  };
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }

  return port;
}

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
