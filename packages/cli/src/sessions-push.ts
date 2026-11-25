import {
  chunkMessages,
  getDefaultT3DbPath,
  locateT3DbPath,
  readT3Thread,
  T3ThreadNotFoundError
} from "@tasker/agents";
import { parsePushSessionMessagesInput } from "@tasker/api/task-commands";
import type { PushSessionMessagesRequest, SessionMessage } from "@tasker/core";
import { CliError } from "./errors.js";
import type { ParsedCommand } from "./parser.js";

export type SessionsPushCommand = Extract<
  ParsedCommand,
  { readonly kind: "sessions_push" }
>;

export type SessionMessagesClient = {
  readonly getHead: (sessionId: string) => Promise<{
    readonly count: number;
    readonly lastExternalId: string | null;
    readonly lastOrdinal: number | null;
  }>;
  readonly pushMessages: (
    sessionId: string,
    input: PushSessionMessagesRequest
  ) => Promise<{
    readonly inserted: number;
    readonly skipped: number;
    readonly total: number;
  }>;
};

export type SessionsPushSummary = {
  readonly inserted: number;
  readonly read: number;
  readonly sent: number;
  readonly sessionId: string;
  readonly skipped: number;
  readonly total: number;
};

export type SessionsPushDependencies = {
  readonly locateT3DbPath: typeof locateT3DbPath;
  readonly readT3Thread: typeof readT3Thread;
};

const defaultDependencies: SessionsPushDependencies = {
  locateT3DbPath,
  readT3Thread
};

export async function executeSessionsPush(
  command: SessionsPushCommand,
  client: SessionMessagesClient,
  dependencies: SessionsPushDependencies = defaultDependencies
): Promise<SessionsPushSummary> {
  const messages = await loadT3Messages(command, dependencies);
  const head = await client.getHead(command.sessionId);
  const lastOrdinal = head.lastOrdinal;

  const toSend =
    command.full || lastOrdinal === null
      ? messages
      : messages.filter((message) => message.ordinal > lastOrdinal);

  if (toSend.length === 0) {
    return {
      inserted: 0,
      read: messages.length,
      sent: 0,
      sessionId: command.sessionId,
      skipped: 0,
      total: head.count
    };
  }

  let inserted = 0;
  let skipped = 0;
  let total = head.count;

  for (const chunk of chunkMessages(toSend)) {
    const result = await client.pushMessages(
      command.sessionId,
      parsePushSessionMessagesInput({ messages: chunk })
    );
    inserted += result.inserted;
    skipped += result.skipped;
    total = result.total;
  }

  return {
    inserted,
    read: messages.length,
    sent: toSend.length,
    sessionId: command.sessionId,
    skipped,
    total
  };
}

async function loadT3Messages(
  command: SessionsPushCommand,
  dependencies: SessionsPushDependencies
): Promise<SessionMessage[]> {
  const dbPath = command.dbPath ?? (await dependencies.locateT3DbPath());
  if (dbPath == null) {
    throw createPushError(`T3 database not found at ${getDefaultT3DbPath()}`);
  }

  try {
    return await dependencies.readT3Thread(dbPath, command.threadId);
  } catch (error) {
    if (error instanceof T3ThreadNotFoundError) {
      throw createPushError(error.message, error);
    }
    if (hasErrorCode(error, "ENOENT")) {
      throw createPushError(`T3 database not found: ${dbPath}`, error);
    }
    if (hasErrorCode(error, "EACCES") || hasErrorCode(error, "EPERM")) {
      throw createPushError(`T3 database is not readable: ${dbPath}`, error);
    }
    throw error;
  }
}

function createPushError(message: string, cause?: unknown): CliError {
  return new CliError(
    "unexpected_error",
    message,
    1,
    cause === undefined ? undefined : { cause }
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
