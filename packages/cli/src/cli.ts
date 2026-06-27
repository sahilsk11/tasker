import { BadRequestError, ConflictError, NotFoundError } from "@tasker/api/service-errors";
import {
  parseClaimSessionInput,
  parseCreateArtifactInput,
  parseCreateTaskInput,
  parseCreatePullRequestInput,
  parseCreateSessionInput
} from "@tasker/api/task-commands";
import {
  cliErrorCodeToExitCode,
  isCliError,
  type CliErrorCode
} from "./errors.js";
import { createLocalRuntime } from "./local-runtime.js";
import { parseArgs, type ParsedCommand } from "./parser.js";

export type CliRunResult = {
  readonly exitCode: number;
  readonly output: string;
};

export async function runCli(
  argv: readonly string[],
  env: NodeJS.ProcessEnv
): Promise<CliRunResult> {
  try {
    const command = parseArgs(argv);

    if (command.kind === "help") {
      return {
        exitCode: 0,
        output: getHelpText()
      };
    }

    const runtime = createLocalRuntime(env);
    try {
      const taskService = runtime.services.task;

      switch (command.kind) {
        case "runtime":
          return success(formatRuntime(runtime.metadata));
        case "artifacts_register":
          return success(
            formatArtifact(
              await taskService.addArtifact(
                command.taskId,
                parseCreateArtifactInput(createArtifactRequest(command))
              )
            )
          );
        case "pull_requests_register":
          return success(
            formatPullRequest(
              await taskService.addPullRequest(
                command.taskId,
                parseCreatePullRequestInput(createPullRequestRequest(command))
              )
            )
          );
        case "tasks_create":
          return success(
            formatTaskJson(
              await taskService.createTask(
                parseCreateTaskInput(createTaskRequest(command))
              )
            )
          );
        case "sessions_create":
          return success(
            formatSession(
              "Task session created",
              await taskService.addSession(
                command.taskId,
                parseCreateSessionInput(createSessionRequest(command))
              )
            )
          );
        case "sessions_claim":
          return success(
            formatClaimResult(
              await taskService.claimSession(
                command.sessionId,
                parseClaimSessionInput(claimSessionRequest(command))
              )
            )
          );
      }
    } finally {
      await runtime.close();
    }
  } catch (error) {
    return failure(error);
  }
}

function createArtifactRequest(
  command: Extract<ParsedCommand, { readonly kind: "artifacts_register" }>
): Record<string, unknown> {
  return {
    ...(command.createdBySessionId !== undefined
      ? { createdBySessionId: command.createdBySessionId }
      : {}),
    label: command.label,
    uri: command.uri
  };
}

function createPullRequestRequest(
  command: Extract<ParsedCommand, { readonly kind: "pull_requests_register" }>
): Record<string, unknown> {
  return {
    url: command.url
  };
}

function createTaskRequest(
  command: Extract<ParsedCommand, { readonly kind: "tasks_create" }>
): Record<string, unknown> {
  return {
    ...(command.description !== undefined ? { description: command.description } : {}),
    ...(command.parentTaskId !== undefined ? { parentTaskId: command.parentTaskId } : {}),
    title: command.title,
    ...(command.workingDirectory !== undefined
      ? { workingDirectory: command.workingDirectory }
      : {})
  };
}

function createSessionRequest(
  command: Extract<ParsedCommand, { readonly kind: "sessions_create" }>
): Record<string, unknown> {
  return {
    ...(command.actionId !== undefined ? { actionId: command.actionId } : {}),
    claimed: command.claimed,
    ...(command.metadata !== undefined ? { metadata: command.metadata } : {}),
    provider: command.provider,
    ...(command.providerId !== undefined ? { providerId: command.providerId } : {}),
    ...(command.transcriptPath !== undefined
      ? { transcriptPath: command.transcriptPath }
      : {})
  };
}

function claimSessionRequest(
  command: Extract<ParsedCommand, { readonly kind: "sessions_claim" }>
): Record<string, unknown> {
  return {
    ...(command.metadata !== undefined ? { metadata: command.metadata } : {}),
    ...(command.provider !== undefined ? { provider: command.provider } : {}),
    ...(command.providerId !== undefined ? { providerId: command.providerId } : {}),
    ...(command.transcriptPath !== undefined
      ? { transcriptPath: command.transcriptPath }
      : {})
  };
}

function success(output: string): CliRunResult {
  return {
    exitCode: 0,
    output
  };
}

function failure(error: unknown): CliRunResult {
  if (isCliError(error)) {
    return {
      exitCode: error.exitCode,
      output: formatError(error.message)
    };
  }

  if (error instanceof BadRequestError) {
    return failureForCode("api_error", error.message);
  }

  if (error instanceof NotFoundError) {
    return failureForCode("api_error", error.message);
  }

  if (error instanceof ConflictError) {
    return failureForCode("api_error", error.message);
  }

  if (isZodError(error)) {
    return failureForCode("api_error", "Validation failed");
  }

  return failureForCode("unexpected_error", getErrorMessage(error));
}

function failureForCode(
  code: CliErrorCode,
  message: string
): CliRunResult {
  return {
    exitCode: cliErrorCodeToExitCode(code),
    output: formatError(message)
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

function isZodError(error: unknown): error is { readonly flatten: () => unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ZodError" &&
    "flatten" in error &&
    typeof error.flatten === "function"
  );
}

function formatRuntime(metadata: Record<string, unknown>): string {
  return [
    "Tasker runtime OK",
    `Service: ${formatValue(metadata["service"])}`,
    `Database: ${formatValue(metadata["databasePath"])}`,
    `Task actions: ${formatValue(metadata["taskActionsPath"])}`,
    `Public API base URL: ${formatValue(metadata["publicApiBaseUrl"])}`
  ].join("\n");
}

function formatArtifact(value: unknown): string {
  const artifact = asRecord(value);

  return [
    "Task artifact registered",
    `Artifact ID: ${formatValue(artifact["id"])}`,
    `Task ID: ${formatValue(artifact["taskId"])}`,
    `Label: ${formatValue(artifact["label"])}`,
    `URI: ${formatValue(artifact["uri"])}`
  ].join("\n");
}

function formatPullRequest(value: unknown): string {
  const pullRequest = asRecord(value);

  return [
    "Task pull request registered",
    `Pull request ID: ${formatValue(pullRequest["id"])}`,
    `Task ID: ${formatValue(pullRequest["taskId"])}`,
    `URL: ${formatValue(pullRequest["url"])}`
  ].join("\n");
}

function formatTaskJson(value: unknown): string {
  return JSON.stringify({ task: value });
}

function formatSession(title: string, value: unknown): string {
  const session = asRecord(value);

  return [
    title,
    `Session ID: ${formatValue(session["id"])}`,
    `Task ID: ${formatValue(session["taskId"])}`,
    `Provider: ${formatValue(session["provider"])}`,
    `Provider ID: ${formatNullableValue(session["providerId"])}`,
    `Claimed: ${session["claimedAt"] == null ? "no" : "yes"}`
  ].join("\n");
}

function formatClaimResult(result: Record<string, unknown>): string {
  const session = asRecord(result["session"]);
  const taskOverview = asRecord(result["taskOverview"]);
  const task = asRecord(taskOverview["task"]);

  return [
    formatSession("Task session claimed", session),
    `Task: ${formatValue(task["title"])} (${formatValue(task["id"])})`
  ].join("\n");
}

function formatError(message: string): string {
  return `Error: ${message}`;
}

function formatNullableValue(value: unknown): string {
  return value == null || value === "" ? "-" : formatValue(value);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "-";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getHelpText(): string {
  return [
    "Usage: tasker <command>",
    "",
    "Commands:",
    "  runtime          Fetch Tasker API runtime details",
    "  artifacts register      Register a task artifact",
    "  pull-requests register  Register a task pull request",
    "  tasks create     Create a task",
    "  sessions create  Create a task session",
    "  sessions claim   Claim an existing task session",
    "  --help           Show this help",
    "",
    "Examples:",
    "  tasker artifacts register --task-id <taskId> --label implement --uri /tmp/notes.md",
    "  tasker pull-requests register --task-id <taskId> --url https://github.com/OWNER/REPO/pull/1",
    "  tasker tasks create --title \"Build importer\" --working-directory $PWD",
    "  tasker sessions create --task-id <taskId> --provider codex --unclaimed",
    "  tasker sessions claim --session-id <sessionId> --provider codex --metadata reportedCwd=$PWD"
  ].join("\n");
}
