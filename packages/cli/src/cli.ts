import { createApiClient, isApiError } from "./api-client.js";
import { resolveApiBaseUrl } from "./base-url.js";
import {
  cliErrorCodeToExitCode,
  isCliError,
  type CliErrorCode
} from "./errors.js";
import { createFailureResult, createSuccessResult, serializeResult } from "./output.js";
import { parseArgs, type ParsedCommand } from "./parser.js";
import type {
  ClaimSessionResponse,
  CreateArtifactResponse,
  CreatePullRequestResponse,
  CreateSessionResponse,
  RuntimeInfo
} from "./types.js";

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
      return success({ help: getHelpText() });
    }

    const apiBaseUrl = resolveApiBaseUrl({
      ...(command.apiBaseUrl === undefined ? {} : { explicitBaseUrl: command.apiBaseUrl }),
      env
    });
    const apiClient = createApiClient(apiBaseUrl);

    switch (command.kind) {
      case "runtime":
        return success(await apiClient.get<RuntimeInfo>("/runtime"));
      case "artifacts_register":
        return success(
          await apiClient.post<CreateArtifactResponse>(
            `/tasks/${encodeURIComponent(command.taskId)}/artifacts`,
            createArtifactRequest(command)
          )
        );
      case "pull_requests_register":
        return success(
          await apiClient.post<CreatePullRequestResponse>(
            `/tasks/${encodeURIComponent(command.taskId)}/pull-requests`,
            createPullRequestRequest(command)
          )
        );
      case "sessions_create":
        return success(
          await apiClient.post<CreateSessionResponse>(
            `/tasks/${encodeURIComponent(command.taskId)}/sessions`,
            createSessionRequest(command)
          )
        );
      case "sessions_claim":
        return success(
          await apiClient.post<ClaimSessionResponse>(
            `/sessions/${encodeURIComponent(command.sessionId)}/claim`,
            claimSessionRequest(command)
          )
        );
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

function success(data: unknown): CliRunResult {
  return {
    exitCode: 0,
    output: serializeResult(createSuccessResult(data))
  };
}

function failure(error: unknown): CliRunResult {
  if (isCliError(error)) {
    return {
      exitCode: error.exitCode,
      output: serializeResult(
        createFailureResult({ code: error.code, message: error.message })
      )
    };
  }

  if (isApiError(error)) {
    return failureForCode("api_error", error.message, {
      body: error.body,
      status: error.status
    });
  }

  if (isNetworkError(error)) {
    return failureForCode("network_error", getErrorMessage(error));
  }

  return failureForCode("unexpected_error", getErrorMessage(error));
}

function failureForCode(
  code: CliErrorCode,
  message: string,
  details: { readonly body?: unknown; readonly status?: number } = {}
): CliRunResult {
  return {
    exitCode: cliErrorCodeToExitCode(code),
    output: serializeResult(
      createFailureResult({
        ...(details.body === undefined ? {} : { body: details.body }),
        code,
        message,
        ...(details.status === undefined ? {} : { status: details.status })
      })
    )
  };
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

function getHelpText(): string {
  return [
    "Usage: tasker [--api-base-url <url>] <command>",
    "",
    "Commands:",
    "  runtime          Fetch Tasker API runtime details",
    "  artifacts register      Register a task artifact",
    "  pull-requests register  Register a task pull request",
    "  sessions create  Create a task session",
    "  sessions claim   Claim an existing task session",
    "  --help           Show this help",
    "",
    "Examples:",
    "  tasker artifacts register --task-id <taskId> --label implement --uri /tmp/notes.md",
    "  tasker pull-requests register --task-id <taskId> --url https://github.com/OWNER/REPO/pull/1",
    "  tasker sessions create --task-id <taskId> --provider codex --unclaimed",
    "  tasker sessions claim --session-id <sessionId> --provider codex --metadata reportedCwd=$PWD"
  ].join("\n");
}
