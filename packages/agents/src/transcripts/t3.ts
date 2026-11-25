import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SessionMessage } from "@tasker/core";
import {
  isRecord,
  type LocateTranscriptOptions,
  normalizeOccurredAt,
  parseJsonObjectLine,
  resolveHomeDir,
  truncateMessageText
} from "./shared.js";

const T3_THREADS_TABLE_EXISTS_QUERY = `
  SELECT 1
  FROM sqlite_master
  WHERE type = 'table' AND name = 'orchestration_v2_projection_threads'
  LIMIT 1
`;

const T3_THREAD_EXISTS_IN_THREADS_QUERY = `
  SELECT 1
  FROM orchestration_v2_projection_threads
  WHERE thread_id = ?
  LIMIT 1
`;

const T3_THREAD_EXISTS_IN_MESSAGES_QUERY = `
  SELECT 1
  FROM orchestration_v2_projection_messages
  WHERE thread_id = ?
  LIMIT 1
`;

// Select assistant rows and human-authored user rows via explicit provenance fields
// (no text-sniffing heuristics). Exclude harness-injected user rows (createdBy != 'user'),
// system notifications (notification != null), and automatic idle compactions
// (idleCompaction != null).
const T3_MESSAGES_QUERY = `
  SELECT message_id, role, streaming, created_at, payload_json
  FROM orchestration_v2_projection_messages
  WHERE thread_id = ?
    AND (
      role = 'assistant'
      OR (
        role = 'user'
        AND json_valid(payload_json)
        AND COALESCE(json_extract(payload_json, '$.createdBy'), 'user') = 'user'
        AND json_extract(payload_json, '$.notification') IS NULL
        AND json_extract(payload_json, '$.idleCompaction') IS NULL
      )
    )
  ORDER BY created_at ASC, message_id ASC
`;

const SQLITE_BUSY_TIMEOUT_MS = 5_000;

export class T3ThreadNotFoundError extends Error {
  public readonly threadId: string;

  public constructor(threadId: string) {
    super(`T3 thread not found: ${threadId}`);
    this.name = "T3ThreadNotFoundError";
    this.threadId = threadId;
  }
}

export function getDefaultT3DbPath(options?: LocateTranscriptOptions): string {
  return join(resolveHomeDir(options), ".t3", "userdata", "statev2.sqlite");
}

export async function locateT3DbPath(
  options?: LocateTranscriptOptions
): Promise<string | null> {
  const candidate = getDefaultT3DbPath(options);
  try {
    const info = await stat(candidate);
    return info.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

export async function readT3Thread(
  dbPath: string,
  threadId: string
): Promise<SessionMessage[]> {
  await access(dbPath, constants.R_OK);

  const db = new DatabaseSync(dbPath, {
    readOnly: true,
    timeout: SQLITE_BUSY_TIMEOUT_MS
  });

  try {
    if (!threadExists(db, threadId)) {
      throw new T3ThreadNotFoundError(threadId);
    }

    const rows = db.prepare(T3_MESSAGES_QUERY).all(threadId);
    const messages: SessionMessage[] = [];

    for (const row of rows) {
      if (!isRecord(row)) {
        continue;
      }

      // Stop at the first row with streaming = 1 and emit nothing at or after it.
      // Emitting an in-flight assistant message would later trigger a 409 content_hash
      // conflict once the message completes, and skipping past it to emit later messages
      // would shift ordinals when the streaming row finishes and enters the sequence.
      if (row["streaming"] !== 0) {
        break;
      }

      const messageId = row["message_id"];
      const role = row["role"];
      const payloadJson = row["payload_json"];

      if (
        typeof messageId !== "string" ||
        messageId.length === 0 ||
        (role !== "user" && role !== "assistant") ||
        typeof payloadJson !== "string"
      ) {
        continue;
      }

      const payload = parseJsonObjectLine(payloadJson);
      if (payload == null) {
        continue;
      }

      const rawText = payload["text"];
      if (typeof rawText !== "string" || rawText.trim().length === 0) {
        continue;
      }

      const occurredAt =
        normalizeOccurredAt(row["created_at"]) ??
        normalizeOccurredAt(payload["createdAt"]);

      messages.push({
        externalId: messageId,
        occurredAt,
        ordinal: messages.length,
        role,
        text: truncateMessageText(rawText)
      });
    }

    return messages;
  } finally {
    db.close();
  }
}

function threadExists(db: DatabaseSync, threadId: string): boolean {
  const hasThreadsTable = db.prepare(T3_THREADS_TABLE_EXISTS_QUERY).get() !== undefined;
  if (
    hasThreadsTable &&
    db.prepare(T3_THREAD_EXISTS_IN_THREADS_QUERY).get(threadId) !== undefined
  ) {
    return true;
  }

  return db.prepare(T3_THREAD_EXISTS_IN_MESSAGES_QUERY).get(threadId) !== undefined;
}
