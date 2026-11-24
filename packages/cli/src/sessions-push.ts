import {
  chunkMessages,
  getDefaultT3DbPath,
  locateClaudeTranscript,
  locateCodexTranscript,
  locateT3DbPath,
  readClaudeTranscript,
  readCodexTranscript,
  readT3Thread,
  type LocateTranscriptOptions
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
  readonly locateClaudeTranscript: typeof locateClaudeTranscript;
  readonly locateCodexTranscript: typeof locateCodexTranscript;
  readonly locateT3DbPath: typeof locateT3DbPath;
  readonly readClaudeTranscript: typeof readClaudeTranscript;
  readonly readCodexTranscript: typeof readCodexTranscript;
  readonly readT3Thread: typeof readT3Thread;
};

const defaultDependencies: SessionsPushDependencies = {
  locateClaudeTranscript,
  locateCodexTranscript,
  locateT3DbPath,
  readClaudeTranscript,
  readCodexTranscript,
  readT3Thread
};

export async function executeSessionsPush(
  command: SessionsPushCommand,
  client: SessionMessagesClient,
  dependencies: SessionsPushDependencies = defaultDependencies
): Promise<SessionsPushSummary> {
  const messages = await loadTranscriptMessages(command, dependencies);
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

async function loadTranscriptMessages(
  command: SessionsPushCommand,
  dependencies: SessionsPushDependencies
): Promise<SessionMessage[]> {
  const locateOptions: LocateTranscriptOptions | undefined =
    command.homeDir !== undefined ? { homeDir: command.homeDir } : undefined;

  switch (command.harness) {
    case "claude": {
      const path =
        command.transcriptPath ??
        (await dependencies.locateClaudeTranscript(command.threadId, locateOptions));
      if (path == null) {
        throw createMissingTranscriptError(
          `Claude transcript not found for thread ${command.threadId}`
        );
      }
      return readWithFriendlyNotFound(
        () => dependencies.readClaudeTranscript(path),
        `Transcript file not found: ${path}`
      );
    }
    case "codex": {
      const path =
        command.transcriptPath ??
        (await dependencies.locateCodexTranscript(command.threadId, locateOptions));
      if (path == null) {
        throw createMissingTranscriptError(
          `Codex transcript not found for thread ${command.threadId}`
        );
      }
      return readWithFriendlyNotFound(
        () => dependencies.readCodexTranscript(path),
        `Transcript file not found: ${path}`
      );
    }
    case "t3": {
      const dbPath =
        command.transcriptPath ?? (await dependencies.locateT3DbPath(locateOptions));
      if (dbPath == null) {
        throw createMissingTranscriptError(
          `T3 database not found at ${getDefaultT3DbPath(locateOptions)}`
        );
      }
      return readWithFriendlyNotFound(
        () => dependencies.readT3Thread(dbPath, command.threadId),
        `T3 database not found: ${dbPath}`
      );
    }
  }
}

async function readWithFriendlyNotFound(
  reader: () => Promise<SessionMessage[]>,
  notFoundMessage: string
): Promise<SessionMessage[]> {
  try {
    return await reader();
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw createMissingTranscriptError(notFoundMessage, error);
    }
    throw error;
  }
}

function createMissingTranscriptError(message: string, cause?: unknown): CliError {
  return new CliError(
    "unexpected_error",
    message,
    1,
    cause === undefined ? undefined : { cause }
  );
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
