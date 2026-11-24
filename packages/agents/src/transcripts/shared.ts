import { open } from "node:fs/promises";
import { homedir } from "node:os";
import {
  SESSION_MESSAGE_MAX_TEXT_LENGTH,
  SESSION_MESSAGES_MAX_PER_PUSH,
  type SessionMessage
} from "@tasker/core";

export type LocateTranscriptOptions = {
  readonly homeDir?: string | undefined;
};

const SYSTEM_REMINDER_RE = /<system-reminder>[\s\S]*?<\/system-reminder>/gu;
const ISO_DATETIME_WITH_OFFSET_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const FIRST_LINE_CHUNK_BYTES = 16_384;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveHomeDir(options?: LocateTranscriptOptions): string {
  return options?.homeDir ?? homedir();
}

export function stripSystemReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_RE, "").trim();
}

export function normalizeOccurredAt(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!ISO_DATETIME_WITH_OFFSET_RE.test(trimmed)) {
    return null;
  }

  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

export function truncateMessageText(
  text: string,
  maxLength: number = SESSION_MESSAGE_MAX_TEXT_LENGTH
): string {
  if (!Number.isInteger(maxLength) || maxLength <= 0) {
    throw new RangeError("maxLength must be a positive integer");
  }

  if (text.length <= maxLength) {
    return text;
  }

  let removed = text.length - maxLength;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const marker = formatTruncationMarker(removed);
    const keep = adjustForSurrogatePair(text, Math.max(0, maxLength - marker.length));
    const nextRemoved = text.length - keep;

    if (nextRemoved === removed) {
      return `${text.slice(0, keep)}${marker}`.slice(0, maxLength);
    }

    removed = nextRemoved;
  }

  const marker = formatTruncationMarker(removed);
  const keep = adjustForSurrogatePair(text, Math.max(0, maxLength - marker.length));
  return `${text.slice(0, keep)}${marker}`.slice(0, maxLength);
}

export function chunkMessages(
  messages: readonly SessionMessage[],
  size: number = SESSION_MESSAGES_MAX_PER_PUSH
): SessionMessage[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("Chunk size must be a positive integer");
  }

  if (messages.length === 0) {
    return [];
  }

  const chunks: SessionMessage[][] = [];
  for (let start = 0; start < messages.length; start += size) {
    chunks.push(messages.slice(start, start + size));
  }
  return chunks;
}

export function parseJsonObjectLine(line: string): Record<string, unknown> | null {
  if (line.trim().length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isSafeFilenameComponent(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    value !== "." &&
    value !== ".."
  );
}

export async function readFirstLine(filePath: string): Promise<string | null> {
  const handle = await open(filePath, "r");
  try {
    const chunks: Buffer[] = [];
    let offset = 0;

    for (;;) {
      const buffer = Buffer.allocUnsafe(FIRST_LINE_CHUNK_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);

      if (bytesRead === 0) {
        break;
      }

      const slice = buffer.subarray(0, bytesRead);
      const newlineIndex = slice.indexOf(0x0a);

      if (newlineIndex !== -1) {
        chunks.push(slice.subarray(0, newlineIndex));
        return Buffer.concat(chunks).toString("utf8").replace(/\r$/u, "");
      }

      chunks.push(slice);
      offset += bytesRead;
    }

    if (chunks.length === 0) {
      return null;
    }

    return Buffer.concat(chunks).toString("utf8").replace(/\r$/u, "");
  } finally {
    await handle.close();
  }
}

function formatTruncationMarker(removedChars: number): string {
  return `…[truncated ${String(removedChars)} chars]`;
}

function adjustForSurrogatePair(text: string, keep: number): number {
  if (keep <= 0 || keep >= text.length) {
    return keep;
  }

  const code = text.charCodeAt(keep - 1);
  if (code >= 0xd800 && code <= 0xdbff) {
    return keep - 1;
  }

  return keep;
}
