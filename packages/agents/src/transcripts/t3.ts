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
  stripSystemReminders,
  truncateMessageText
} from "./shared.js";

const T3_MESSAGES_QUERY = `
  SELECT message_id, role, created_at, payload_json
  FROM orchestration_v2_projection_messages
  WHERE thread_id = ?
  ORDER BY created_at ASC, message_id ASC
`;

const SQLITE_BUSY_TIMEOUT_MS = 5_000;

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
    const rows = db.prepare(T3_MESSAGES_QUERY).all(threadId);
    const messages: SessionMessage[] = [];

    for (const row of rows) {
      if (!isRecord(row)) {
        continue;
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
      if (typeof rawText !== "string") {
        continue;
      }

      const text =
        role === "user" && rawText.includes("<system-reminder>")
          ? stripSystemReminders(rawText)
          : rawText;

      if (text.trim().length === 0) {
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
        text: truncateMessageText(text)
      });
    }

    return messages;
  } finally {
    db.close();
  }
}
