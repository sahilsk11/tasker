import { homedir } from "node:os";
import {
  SESSION_MESSAGE_MAX_TEXT_LENGTH,
  SESSION_MESSAGES_MAX_PER_PUSH,
  type SessionMessage
} from "@tasker/core";

export type LocateTranscriptOptions = {
  readonly homeDir?: string | undefined;
};

const ISO_DATETIME_WITH_OFFSET_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveHomeDir(options?: LocateTranscriptOptions): string {
  return options?.homeDir ?? homedir();
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
