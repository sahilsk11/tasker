export type CliErrorCode =
  | "api_error"
  | "config_error"
  | "network_error"
  | "parse_error"
  | "unexpected_error";

export class CliError extends Error {
  public constructor(
    public readonly code: CliErrorCode,
    message: string,
    public readonly exitCode: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "CliError";
  }
}

export function createParseError(message: string): CliError {
  return new CliError("parse_error", message, 2);
}

export function createConfigError(message: string, options?: ErrorOptions): CliError {
  return new CliError("config_error", message, 2, options);
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}

export function cliErrorCodeToExitCode(code: CliErrorCode): number {
  switch (code) {
    case "config_error":
    case "parse_error":
      return 2;
    case "api_error":
    case "network_error":
    case "unexpected_error":
      return 1;
  }
}
