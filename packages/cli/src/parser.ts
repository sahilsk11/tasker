import { createParseError } from "./errors.js";

export type ParsedCommand =
  | {
      readonly apiBaseUrl?: string;
      readonly kind: "runtime";
    }
  | {
      readonly actionId?: string | null;
      readonly apiBaseUrl?: string;
      readonly claimed: boolean;
      readonly kind: "sessions_create";
      readonly metadata?: Record<string, unknown> | null;
      readonly provider: string;
      readonly providerId?: string | null;
      readonly taskId: string;
      readonly transcriptPath?: string | null;
    }
  | {
      readonly apiBaseUrl?: string;
      readonly kind: "sessions_claim";
      readonly metadata?: Record<string, unknown> | null;
      readonly provider?: string | null;
      readonly providerId?: string | null;
      readonly sessionId: string;
      readonly transcriptPath?: string | null;
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
    if (command !== "sessions") {
      throw createParseError(`Unknown command: ${command}`);
    }

    return parseSessionsCommand(remaining, apiBaseUrl);
  }

  if (remaining.length > 0) {
    throw createParseError(`Unexpected argument for runtime: ${remaining[0] ?? ""}`);
  }

  return apiBaseUrl === undefined ? { kind: "runtime" } : { apiBaseUrl, kind: "runtime" };
}

function parseSessionsCommand(
  args: readonly string[],
  apiBaseUrl: string | undefined
): ParsedCommand {
  const remaining = [...args];
  const subcommand = remaining.shift();

  if (subcommand === undefined) {
    throw createParseError("sessions requires a subcommand: create or claim");
  }

  if (subcommand === "create") {
    return parseSessionsCreate(remaining, apiBaseUrl);
  }

  if (subcommand === "claim") {
    return parseSessionsClaim(remaining, apiBaseUrl);
  }

  throw createParseError(`Unknown sessions subcommand: ${subcommand}`);
}

function parseSessionsCreate(
  args: readonly string[],
  apiBaseUrl: string | undefined
): ParsedCommand {
  let actionId: string | null | undefined;
  let claimed = true;
  let metadata: Record<string, unknown> | null | undefined;
  let provider: string | undefined;
  let providerId: string | null | undefined;
  let taskId: string | undefined;
  let transcriptPath: string | null | undefined;

  const remaining = [...args];
  while (remaining.length > 0) {
    const flag = remaining.shift();

    if (flag === "--unclaimed") {
      claimed = false;
      continue;
    }

    if (flag === "--task-id") {
      taskId = readFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--task-id=") === true) {
      taskId = readInlineFlagValue(flag, "--task-id");
      continue;
    }

    if (flag === "--provider") {
      provider = readFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--provider=") === true) {
      provider = readInlineFlagValue(flag, "--provider");
      continue;
    }

    if (flag === "--action-id") {
      actionId = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--action-id=") === true) {
      actionId = readNullableInlineFlagValue(flag, "--action-id");
      continue;
    }

    if (flag === "--provider-id") {
      providerId = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--provider-id=") === true) {
      providerId = readNullableInlineFlagValue(flag, "--provider-id");
      continue;
    }

    if (flag === "--transcript-path") {
      transcriptPath = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--transcript-path=") === true) {
      transcriptPath = readNullableInlineFlagValue(flag, "--transcript-path");
      continue;
    }

    if (flag === "--metadata-json") {
      metadata = mergeMetadata(metadata, parseMetadataJson(readFlagValue(remaining, flag)));
      continue;
    }

    if (flag?.startsWith("--metadata-json=") === true) {
      metadata = mergeMetadata(
        metadata,
        parseMetadataJson(readInlineFlagValue(flag, "--metadata-json"))
      );
      continue;
    }

    if (flag === "--metadata") {
      metadata = mergeMetadata(metadata, parseMetadataPair(readFlagValue(remaining, flag)));
      continue;
    }

    if (flag?.startsWith("--metadata=") === true) {
      metadata = mergeMetadata(
        metadata,
        parseMetadataPair(readInlineFlagValue(flag, "--metadata"))
      );
      continue;
    }

    throw createParseError(`Unknown option for sessions create: ${flag ?? ""}`);
  }

  if (taskId === undefined) {
    throw createParseError("sessions create requires --task-id");
  }

  if (provider === undefined) {
    throw createParseError("sessions create requires --provider");
  }

  return {
    ...(actionId !== undefined ? { actionId } : {}),
    ...(apiBaseUrl === undefined ? {} : { apiBaseUrl }),
    claimed,
    kind: "sessions_create",
    ...(metadata !== undefined ? { metadata } : {}),
    provider,
    ...(providerId !== undefined ? { providerId } : {}),
    taskId,
    ...(transcriptPath !== undefined ? { transcriptPath } : {})
  };
}

function parseSessionsClaim(
  args: readonly string[],
  apiBaseUrl: string | undefined
): ParsedCommand {
  let metadata: Record<string, unknown> | null | undefined;
  let provider: string | null | undefined;
  let providerId: string | null | undefined;
  let sessionId: string | undefined;
  let transcriptPath: string | null | undefined;

  const remaining = [...args];
  while (remaining.length > 0) {
    const flag = remaining.shift();

    if (flag === "--session-id") {
      sessionId = readFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--session-id=") === true) {
      sessionId = readInlineFlagValue(flag, "--session-id");
      continue;
    }

    if (flag === "--provider") {
      provider = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--provider=") === true) {
      provider = readNullableInlineFlagValue(flag, "--provider");
      continue;
    }

    if (flag === "--provider-id") {
      providerId = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--provider-id=") === true) {
      providerId = readNullableInlineFlagValue(flag, "--provider-id");
      continue;
    }

    if (flag === "--transcript-path") {
      transcriptPath = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--transcript-path=") === true) {
      transcriptPath = readNullableInlineFlagValue(flag, "--transcript-path");
      continue;
    }

    if (flag === "--metadata-json") {
      metadata = mergeMetadata(metadata, parseMetadataJson(readFlagValue(remaining, flag)));
      continue;
    }

    if (flag?.startsWith("--metadata-json=") === true) {
      metadata = mergeMetadata(
        metadata,
        parseMetadataJson(readInlineFlagValue(flag, "--metadata-json"))
      );
      continue;
    }

    if (flag === "--metadata") {
      metadata = mergeMetadata(metadata, parseMetadataPair(readFlagValue(remaining, flag)));
      continue;
    }

    if (flag?.startsWith("--metadata=") === true) {
      metadata = mergeMetadata(
        metadata,
        parseMetadataPair(readInlineFlagValue(flag, "--metadata"))
      );
      continue;
    }

    throw createParseError(`Unknown option for sessions claim: ${flag ?? ""}`);
  }

  if (sessionId === undefined) {
    throw createParseError("sessions claim requires --session-id");
  }

  return {
    ...(apiBaseUrl === undefined ? {} : { apiBaseUrl }),
    kind: "sessions_claim",
    ...(metadata !== undefined ? { metadata } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(providerId !== undefined ? { providerId } : {}),
    sessionId,
    ...(transcriptPath !== undefined ? { transcriptPath } : {})
  };
}

function readFlagValue(remaining: string[], flag: string): string {
  const value = remaining.shift();
  if (value === undefined || value.startsWith("-")) {
    throw createParseError(`${flag} requires a value`);
  }
  return value;
}

function readInlineFlagValue(arg: string, flag: string): string {
  const value = arg.slice(`${flag}=`.length);
  if (value.length === 0) {
    throw createParseError(`${flag} requires a value`);
  }
  return value;
}

function readNullableFlagValue(remaining: string[], flag: string): string | null {
  return parseNullableValue(readFlagValue(remaining, flag));
}

function readNullableInlineFlagValue(arg: string, flag: string): string | null {
  return parseNullableValue(readInlineFlagValue(arg, flag));
}

function parseNullableValue(value: string): string | null {
  return value === "null" ? null : value;
}

function parseMetadataJson(value: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw createParseError("--metadata-json must be valid JSON");
  }

  if (parsed === null) {
    return null;
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createParseError("--metadata-json must be a JSON object or null");
  }

  return parsed as Record<string, unknown>;
}

function parseMetadataPair(value: string): Record<string, unknown> {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0) {
    throw createParseError("--metadata requires key=value");
  }

  return {
    [value.slice(0, separatorIndex)]: value.slice(separatorIndex + 1)
  };
}

function mergeMetadata(
  current: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (next === null) {
    return null;
  }

  return {
    ...(current ?? {}),
    ...next
  };
}
