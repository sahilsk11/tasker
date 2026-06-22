import { createParseError } from "./errors.js";

export type ParsedCommand =
  | {
      readonly apiBaseUrl?: string;
      readonly kind: "runtime";
    }
  | {
      readonly kind: "help";
    };

export function parseArgs(argv: readonly string[]): ParsedCommand {
  const remaining = [...argv];
  let apiBaseUrl: string | undefined;

  while (remaining.length > 0) {
    const arg = remaining[0];

    if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    }

    if (arg === "--api-base-url") {
      remaining.shift();
      const value = remaining.shift();
      if (value === undefined || value.startsWith("-")) {
        throw createParseError("--api-base-url requires a URL value");
      }
      apiBaseUrl = value;
      continue;
    }

    if (arg?.startsWith("--api-base-url=") === true) {
      const value = arg.slice("--api-base-url=".length);
      if (value.length === 0) {
        throw createParseError("--api-base-url requires a URL value");
      }
      apiBaseUrl = value;
      remaining.shift();
      continue;
    }

    break;
  }

  const command = remaining.shift();
  if (command === undefined) {
    return { kind: "help" };
  }

  if (command.startsWith("-")) {
    throw createParseError(`Unknown option: ${command}`);
  }

  if (command !== "runtime") {
    throw createParseError(`Unknown command: ${command}`);
  }

  if (remaining.length > 0) {
    throw createParseError(`Unexpected argument for runtime: ${remaining[0] ?? ""}`);
  }

  return apiBaseUrl === undefined ? { kind: "runtime" } : { apiBaseUrl, kind: "runtime" };
}
