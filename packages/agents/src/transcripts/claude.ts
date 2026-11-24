import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SessionMessage } from "@tasker/core";
import {
  isRecord,
  isSafeFilenameComponent,
  type LocateTranscriptOptions,
  normalizeOccurredAt,
  parseJsonObjectLine,
  resolveHomeDir,
  stripSystemReminders,
  truncateMessageText
} from "./shared.js";

const CLAUDE_SYSTEM_PREFIXES = [
  "<system-reminder",
  "<local-command",
  "<command-name",
  "<bash-stdout",
  "<task-notification",
  "<ide_",
  "Caveat:"
] as const;

const CLAUDE_BLOCKED_USER_PREFIXES = [
  "<local-command-",
  "<command-name>",
  "Caveat:"
] as const;

export function extractClaudeContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const block of content) {
    if (isRecord(block) && block["type"] === "text" && typeof block["text"] === "string") {
      parts.push(block["text"]);
    }
  }
  return parts.join("\n");
}

export function isClaudeUserTextAllowed(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (
    CLAUDE_SYSTEM_PREFIXES.some((prefix) => trimmed.startsWith(prefix)) &&
    trimmed.includes("</system-reminder>") &&
    stripSystemReminders(trimmed).length === 0
  ) {
    return false;
  }

  return !CLAUDE_BLOCKED_USER_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export async function readClaudeTranscript(jsonlPath: string): Promise<SessionMessage[]> {
  const raw = await readFile(jsonlPath, "utf8");
  const lines = raw.split(/\r?\n/u);
  const messages: SessionMessage[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const record = parseJsonObjectLine(line);
    if (record == null) {
      continue;
    }

    if (Boolean(record["isSidechain"]) || Boolean(record["isMeta"])) {
      continue;
    }

    const message = record["message"];
    if (!isRecord(message)) {
      continue;
    }

    const recordType = record["type"];
    const occurredAt = normalizeOccurredAt(record["timestamp"]);
    const baseId = resolveClaudeRecordId(record, lineIndex);

    if (recordType === "user") {
      const content = message["content"];
      if (hasToolResultBlock(content)) {
        continue;
      }

      const cleaned = stripSystemReminders(extractClaudeContentText(content));
      if (!isClaudeUserTextAllowed(cleaned)) {
        continue;
      }

      messages.push({
        externalId: baseId,
        occurredAt,
        ordinal: messages.length,
        role: "user",
        text: truncateMessageText(cleaned)
      });
      continue;
    }

    if (recordType === "assistant" && Array.isArray(message["content"])) {
      const textBlocks = extractAssistantTextBlocks(message["content"]);
      for (const [blockIndex, blockText] of textBlocks.entries()) {
        const externalId =
          textBlocks.length === 1 ? baseId : `${baseId}:${String(blockIndex)}`;

        messages.push({
          externalId,
          occurredAt,
          ordinal: messages.length,
          role: "assistant",
          text: truncateMessageText(blockText)
        });
      }
    }
  }

  return messages;
}

export async function locateClaudeTranscript(
  threadId: string,
  options?: LocateTranscriptOptions
): Promise<string | null> {
  if (!isSafeFilenameComponent(threadId)) {
    return null;
  }

  const projectsDir = join(resolveHomeDir(options), ".claude", "projects");
  let entries;
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));

  const targetFilename = `${threadId}.jsonl`;
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = join(projectsDir, entry.name, targetFilename);
    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        return candidate;
      }
    } catch {
      // File not present in this project directory.
    }
  }

  return null;
}

function resolveClaudeRecordId(record: Record<string, unknown>, lineIndex: number): string {
  const uuid = record["uuid"];
  return typeof uuid === "string" && uuid.length > 0 ? uuid : `line:${String(lineIndex)}`;
}

function hasToolResultBlock(content: unknown): boolean {
  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((block) => isRecord(block) && block["type"] === "tool_result");
}

function extractAssistantTextBlocks(content: readonly unknown[]): string[] {
  const blocks: string[] = [];

  for (const block of content) {
    if (
      isRecord(block) &&
      block["type"] === "text" &&
      typeof block["text"] === "string" &&
      block["text"].trim().length > 0
    ) {
      blocks.push(block["text"]);
    }
  }

  return blocks;
}
