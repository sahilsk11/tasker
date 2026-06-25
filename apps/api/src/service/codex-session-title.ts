import Database from "better-sqlite3";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type CodexSessionTitleDiscovery = {
  readonly sessionIndexPath: string;
  readonly statePath: string;
};

export function defaultCodexTitleDiscovery(): CodexSessionTitleDiscovery {
  const codexHome = join(homedir(), ".codex");
  return {
    sessionIndexPath: join(codexHome, "session_index.jsonl"),
    statePath: join(codexHome, "state_5.sqlite")
  };
}

export async function resolveCodexSessionDisplayTitle(
  providerId: string,
  options: CodexSessionTitleDiscovery
): Promise<string | null> {
  return (
    (await readSessionIndexTitle(providerId, options.sessionIndexPath)) ??
    readStateTitle(providerId, options.statePath)
  );
}

async function readSessionIndexTitle(
  providerId: string,
  sessionIndexPath: string
): Promise<string | null> {
  let content;
  try {
    content = await readFile(sessionIndexPath, "utf8");
  } catch (error) {
    if (isCodexLookupUnavailableError(error)) {
      return null;
    }
    throw error;
  }

  let title: string | null = null;
  for (const line of content.split("\n")) {
    const parsed = parseJsonObject(line);
    if (parsed?.["id"] !== providerId) {
      continue;
    }

    const threadName = parsed["thread_name"];
    if (typeof threadName === "string" && threadName.trim().length > 0) {
      title = cleanTitle(threadName);
    }
  }

  return title;
}

function readStateTitle(providerId: string, statePath: string): string | null {
  let db;
  try {
    db = new Database(statePath, { fileMustExist: true, readonly: true });
    const row = db
      .prepare(
        `SELECT title, preview, first_user_message
         FROM threads
         WHERE id = ?`
      )
      .get(providerId) as CodexThreadTitleRow | undefined;

    return row == null ? null : getDisplayTitleFromThreadRow(row);
  } catch (error) {
    if (isCodexLookupUnavailableError(error)) {
      return null;
    }
    throw error;
  } finally {
    db?.close();
  }
}

function getDisplayTitleFromThreadRow(row: CodexThreadTitleRow): string | null {
  const title = cleanTitle(row.title);
  const preview = cleanTitle(row.preview);
  const firstUserMessage = cleanTitle(row.first_user_message);

  if (
    title != null &&
    title !== firstUserMessage &&
    title !== preview
  ) {
    return title;
  }

  return truncateTitle(preview ?? firstUserMessage ?? title);
}

function truncateTitle(value: string | null): string | null {
  if (value == null) {
    return null;
  }

  const maxLength = 96;
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function cleanTitle(value: string | null): string | null {
  if (value == null) {
    return null;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length === 0 ? null : cleaned;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isCodexLookupUnavailableError(error: unknown): boolean {
  if (
    error != null &&
    typeof error === "object" &&
    "code" in error &&
    ["ENOENT", "EACCES", "EPERM"].includes(
      String((error as { readonly code?: unknown }).code)
    )
  ) {
    return true;
  }

  if (error instanceof Error) {
    return (
      error.message.includes("Cannot open database because the directory does not exist") ||
      error.message.includes("no such table: threads") ||
      error.message.includes("file is not a database") ||
      error.message.includes("database is locked") ||
      error.message.includes("unable to open database file")
    );
  }

  return false;
}

type CodexThreadTitleRow = {
  readonly first_user_message: string | null;
  readonly preview: string | null;
  readonly title: string | null;
};
