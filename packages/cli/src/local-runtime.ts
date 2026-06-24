import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTaskerRuntime, type CreateTaskerRuntimeOptions } from "@tasker/api/runtime";

export function createLocalRuntime(env: NodeJS.ProcessEnv) {
  return createTaskerRuntime(createRuntimeOptions(env));
}

function createRuntimeOptions(env: NodeJS.ProcessEnv): CreateTaskerRuntimeOptions {
  const agentRunProvider = normalizeOptionalEnv(env["TASKER_AGENT_RUN_PROVIDER"]) ?? "kanna";
  const artifactArchiveRoot = normalizeOptionalEnv(env["TASKER_ARTIFACT_ARCHIVE_ROOT"]);
  const artifactRoot = normalizeOptionalEnv(env["TASKER_ARTIFACT_ROOT"]);
  const codexSessionsRoot = normalizeOptionalEnv(env["CODEX_SESSIONS_ROOT"]);
  const kannaChatsLogPath = normalizeOptionalEnv(env["KANNA_CHATS_LOG_PATH"]);
  const migrationsDirectory =
    normalizeOptionalEnv(env["TASKER_MIGRATIONS_DIR"]) ?? findExistingPath([
      join(process.cwd(), "apps/api/migrations"),
      join(process.cwd(), "migrations")
    ]);
  const publicApiBaseUrl = normalizeOptionalEnv(env["PUBLIC_API_BASE_URL"]);
  const taskActionsPath =
    normalizeOptionalEnv(env["TASK_ACTIONS_PATH"]) ?? findExistingPath([
      join(process.cwd(), "apps/api/task-actions.json"),
      join(process.cwd(), "task-actions.json")
    ]);

  return {
    agentRunProvider,
    artifactStorage: {
      ...(artifactArchiveRoot === undefined ? {} : { archiveRoot: artifactArchiveRoot }),
      ...(artifactRoot === undefined ? {} : { activeRoot: artifactRoot })
    },
    ...(codexSessionsRoot === undefined ? {} : { codexSessionsRoot }),
    databasePath: env["DATABASE_PATH"] ?? "./tasker.sqlite",
    kanna: {
      agentModel: normalizeOptionalEnv(env["KANNA_AGENT_MODEL"]) ?? "gpt-5.5",
      agentProvider: normalizeOptionalEnv(env["KANNA_AGENT_PROVIDER"]) ?? "codex",
      baseUrl: normalizeOptionalEnv(env["KANNA_BASE_URL"]) ?? "http://127.0.0.1:3210",
      ...(kannaChatsLogPath === undefined ? {} : { chatsLogPath: kannaChatsLogPath }),
      codexFastMode: parseBooleanEnv(env["KANNA_CODEX_FAST_MODE"]) ?? false,
      codexReasoningEffort:
        normalizeOptionalEnv(env["KANNA_CODEX_REASONING_EFFORT"]) ?? "high"
    },
    linearApiKey: normalizeOptionalEnv(env["LINEAR_API_KEY"]) ?? null,
    ...(migrationsDirectory === undefined ? {} : { migrationsDirectory }),
    ...(publicApiBaseUrl === undefined ? {} : { publicApiBaseUrl }),
    ...(taskActionsPath === undefined ? {} : { taskActionsPath })
  };
}

function normalizeOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed == null || trimmed.length === 0 ? undefined : trimmed;
}

function parseBooleanEnv(value: string | undefined): boolean | null {
  const normalized = normalizeOptionalEnv(value)?.toLowerCase();
  if (normalized == null) {
    return null;
  }

  return ["1", "true", "yes", "on"].includes(normalized);
}

function findExistingPath(candidates: readonly string[]): string | undefined {
  return candidates.find((candidate) => existsSync(candidate));
}
