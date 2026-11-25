import { createParseError } from "./errors.js";

export type ParsedCommand =
  | {
      readonly kind: "runtime";
    }
  | {
      readonly createdBySessionId?: string | null;
      readonly kind: "artifacts_register";
      readonly label: "research" | "plan" | "implement" | "other";
      readonly taskId: string;
      readonly uri: string;
    }
  | {
      readonly kind: "pull_requests_register";
      readonly taskId: string;
      readonly url: string;
    }
  | {
      readonly description?: string | null;
      readonly kind: "tasks_create";
      readonly parentTaskId?: string | null;
      readonly title: string;
      readonly workingDirectory?: string | null;
    }
  | {
      readonly kind: "tasks_get";
      readonly taskId: string;
    }
  | {
      readonly kind: "tasks_list";
      readonly parentTaskId: string | null;
    }
  | {
      readonly actionId?: string | null;
      readonly claimed: boolean;
      readonly kind: "sessions_create";
      readonly metadata?: Record<string, unknown> | null;
      readonly provider: string;
      readonly providerId?: string | null;
      readonly taskId: string;
      readonly transcriptPath?: string | null;
    }
  | {
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

  while (remaining.length > 0) {
    const arg = remaining[0];

    if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
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

  if (command === "artifacts") {
    return parseArtifactsCommand(remaining);
  }

  if (command === "pull-requests") {
    return parsePullRequestsCommand(remaining);
  }

  if (command === "task" || command === "tasks") {
    return parseTasksCommand(remaining);
  }

  if (command === "sessions") {
    return parseSessionsCommand(remaining);
  }

  if (command !== "runtime") {
    throw createParseError(`Unknown command: ${command}`);
  }

  if (remaining.length > 0) {
    throw createParseError(`Unexpected argument for runtime: ${remaining[0] ?? ""}`);
  }

  return { kind: "runtime" };
}

function parseArtifactsCommand(args: readonly string[]): ParsedCommand {
  const remaining = [...args];
  const subcommand = remaining.shift();

  if (subcommand === undefined) {
    throw createParseError("artifacts requires a subcommand: register");
  }

  if (subcommand === "register") {
    return parseArtifactsRegister(remaining);
  }

  throw createParseError(`Unknown artifacts subcommand: ${subcommand}`);
}

function parseArtifactsRegister(args: readonly string[]): ParsedCommand {
  let createdBySessionId: string | null | undefined;
  let label: "research" | "plan" | "implement" | "other" | undefined;
  let taskId: string | undefined;
  let uri: string | undefined;

  const remaining = [...args];
  while (remaining.length > 0) {
    const flag = remaining.shift();

    if (flag === "--task-id") {
      taskId = readFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--task-id=") === true) {
      taskId = readInlineFlagValue(flag, "--task-id");
      continue;
    }

    if (flag === "--label") {
      label = parseArtifactLabel(readFlagValue(remaining, flag));
      continue;
    }

    if (flag?.startsWith("--label=") === true) {
      label = parseArtifactLabel(readInlineFlagValue(flag, "--label"));
      continue;
    }

    if (flag === "--uri") {
      uri = readFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--uri=") === true) {
      uri = readInlineFlagValue(flag, "--uri");
      continue;
    }

    if (flag === "--created-by-session-id") {
      createdBySessionId = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--created-by-session-id=") === true) {
      createdBySessionId = readNullableInlineFlagValue(flag, "--created-by-session-id");
      continue;
    }

    throw createParseError(`Unknown option for artifacts register: ${flag ?? ""}`);
  }

  if (taskId === undefined) {
    throw createParseError("artifacts register requires --task-id");
  }

  if (label === undefined) {
    throw createParseError("artifacts register requires --label");
  }

  if (uri === undefined) {
    throw createParseError("artifacts register requires --uri");
  }

  return {
    ...(createdBySessionId !== undefined ? { createdBySessionId } : {}),
    kind: "artifacts_register",
    label,
    taskId,
    uri
  };
}

function parsePullRequestsCommand(args: readonly string[]): ParsedCommand {
  const remaining = [...args];
  const subcommand = remaining.shift();

  if (subcommand === undefined) {
    throw createParseError("pull-requests requires a subcommand: register");
  }

  if (subcommand === "register") {
    return parsePullRequestsRegister(remaining);
  }

  throw createParseError(`Unknown pull-requests subcommand: ${subcommand}`);
}

function parsePullRequestsRegister(args: readonly string[]): ParsedCommand {
  let taskId: string | undefined;
  let url: string | undefined;

  const remaining = [...args];
  while (remaining.length > 0) {
    const flag = remaining.shift();

    if (flag === "--task-id") {
      taskId = readFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--task-id=") === true) {
      taskId = readInlineFlagValue(flag, "--task-id");
      continue;
    }

    if (flag === "--url") {
      url = readFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--url=") === true) {
      url = readInlineFlagValue(flag, "--url");
      continue;
    }

    throw createParseError(`Unknown option for pull-requests register: ${flag ?? ""}`);
  }

  if (taskId === undefined) {
    throw createParseError("pull-requests register requires --task-id");
  }

  if (url === undefined) {
    throw createParseError("pull-requests register requires --url");
  }

  return {
    kind: "pull_requests_register",
    taskId,
    url
  };
}

function parseTasksCommand(args: readonly string[]): ParsedCommand {
  const remaining = [...args];
  const subcommand = remaining.shift();

  if (subcommand === undefined) {
    throw createParseError("tasks requires a subcommand: create, get, or list");
  }

  if (subcommand === "create") {
    return parseTasksCreate(remaining);
  }

  if (subcommand === "get") {
    return parseTasksGet(remaining);
  }

  if (subcommand === "list") {
    return parseTasksList(remaining);
  }

  throw createParseError(`Unknown tasks subcommand: ${subcommand}`);
}

function parseTasksCreate(args: readonly string[]): ParsedCommand {
  let description: string | null | undefined;
  let parentTaskId: string | null | undefined;
  let title: string | undefined;
  let workingDirectory: string | null | undefined;

  const remaining = [...args];
  while (remaining.length > 0) {
    const flag = remaining.shift();

    if (flag === "--title") {
      title = readFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--title=") === true) {
      title = readInlineFlagValue(flag, "--title");
      continue;
    }

    if (flag === "--description") {
      description = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--description=") === true) {
      description = readNullableInlineFlagValue(flag, "--description");
      continue;
    }

    if (flag === "--parent-task-id") {
      parentTaskId = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--parent-task-id=") === true) {
      parentTaskId = readNullableInlineFlagValue(flag, "--parent-task-id");
      continue;
    }

    if (flag === "--working-directory") {
      workingDirectory = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--working-directory=") === true) {
      workingDirectory = readNullableInlineFlagValue(flag, "--working-directory");
      continue;
    }

    throw createParseError(`Unknown option for tasks create: ${flag ?? ""}`);
  }

  if (title === undefined) {
    throw createParseError("tasks create requires --title");
  }

  return {
    ...(description !== undefined ? { description } : {}),
    kind: "tasks_create",
    ...(parentTaskId !== undefined ? { parentTaskId } : {}),
    title,
    ...(workingDirectory !== undefined ? { workingDirectory } : {})
  };
}

function parseTasksGet(args: readonly string[]): ParsedCommand {
  let taskId: string | undefined;

  const remaining = [...args];
  while (remaining.length > 0) {
    const arg = remaining.shift();

    if (arg === "--task-id") {
      taskId = readFlagValue(remaining, arg);
      continue;
    }

    if (arg?.startsWith("--task-id=") === true) {
      taskId = readInlineFlagValue(arg, "--task-id");
      continue;
    }

    if (arg?.startsWith("-") === true) {
      throw createParseError(`Unknown option for tasks get: ${arg}`);
    }

    if (taskId !== undefined) {
      throw createParseError(`Unexpected argument for tasks get: ${arg ?? ""}`);
    }

    taskId = arg;
  }

  if (taskId === undefined) {
    throw createParseError("tasks get requires a task id");
  }

  return {
    kind: "tasks_get",
    taskId
  };
}

function parseTasksList(args: readonly string[]): ParsedCommand {
  let parentTaskId: string | null = null;

  const remaining = [...args];
  while (remaining.length > 0) {
    const flag = remaining.shift();

    if (flag === "--parent-task-id") {
      parentTaskId = readNullableFlagValue(remaining, flag);
      continue;
    }

    if (flag?.startsWith("--parent-task-id=") === true) {
      parentTaskId = readNullableInlineFlagValue(flag, "--parent-task-id");
      continue;
    }

    throw createParseError(`Unknown option for tasks list: ${flag ?? ""}`);
  }

  return {
    kind: "tasks_list",
    parentTaskId
  };
}

function parseSessionsCommand(args: readonly string[]): ParsedCommand {
  const remaining = [...args];
  const subcommand = remaining.shift();

  if (subcommand === undefined) {
    throw createParseError("sessions requires a subcommand: create or claim");
  }

  if (subcommand === "create") {
    return parseSessionsCreate(remaining);
  }

  if (subcommand === "claim") {
    return parseSessionsClaim(remaining);
  }

  throw createParseError(`Unknown sessions subcommand: ${subcommand}`);
}

function parseSessionsCreate(args: readonly string[]): ParsedCommand {
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
    claimed,
    kind: "sessions_create",
    ...(metadata !== undefined ? { metadata } : {}),
    provider,
    ...(providerId !== undefined ? { providerId } : {}),
    taskId,
    ...(transcriptPath !== undefined ? { transcriptPath } : {})
  };
}

function parseSessionsClaim(args: readonly string[]): ParsedCommand {
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

function parseArtifactLabel(value: string): "research" | "plan" | "implement" | "other" {
  if (value === "research" || value === "plan" || value === "implement" || value === "other") {
    return value;
  }

  throw createParseError(
    "--label must be one of: research, plan, implement, other"
  );
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
