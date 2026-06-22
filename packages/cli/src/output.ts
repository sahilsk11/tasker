import type { CliErrorCode } from "./errors.js";

export type CliSuccess<T> = {
  readonly data: T;
  readonly ok: true;
};

export type CliFailure = {
  readonly error: {
    readonly body?: unknown;
    readonly code: CliErrorCode;
    readonly message: string;
    readonly status?: number;
  };
  readonly ok: false;
};

export type CliResult<T> = CliSuccess<T> | CliFailure;

export function createSuccessResult<T>(data: T): CliSuccess<T> {
  return { data, ok: true };
}

export function createFailureResult(error: CliFailure["error"]): CliFailure {
  return { error, ok: false };
}

export function serializeResult(result: CliResult<unknown>): string {
  return JSON.stringify(result);
}
