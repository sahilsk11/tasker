import { createApiClient, isApiError } from "./api-client.js";
import { resolveApiBaseUrl } from "./base-url.js";
import {
  cliErrorCodeToExitCode,
  isCliError,
  type CliErrorCode
} from "./errors.js";
import { createFailureResult, createSuccessResult, serializeResult } from "./output.js";
import { parseArgs } from "./parser.js";
import type { RuntimeInfo } from "./types.js";

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
    const runtime = await apiClient.get<RuntimeInfo>("/runtime");

    return success(runtime);
  } catch (error) {
    return failure(error);
  }
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
    "  runtime    Fetch Tasker API runtime details",
    "  --help     Show this help"
  ].join("\n");
}
