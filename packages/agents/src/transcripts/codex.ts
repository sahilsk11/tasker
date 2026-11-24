import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionMessage } from "@tasker/core";
import {
  isRecord,
  type LocateTranscriptOptions,
  normalizeOccurredAt,
  parseJsonObjectLine,
  readFirstLine,
  resolveHomeDir,
  stripSystemReminders,
  truncateMessageText
} from "./shared.js";

export async function readCodexTranscript(rolloutPath: string): Promise<SessionMessage[]> {
  const raw = await readFile(rolloutPath, "utf8");
  const lines = raw.split(/\r?\n/u);
  const messages: SessionMessage[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const record = parseJsonObjectLine(line);
    if (record?.["type"] !== "response_item") {
      continue;
    }

    const payload = record["payload"];
    if (!isRecord(payload) || payload["type"] !== "message") {
      continue;
    }

    const role = payload["role"];
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const content = payload["content"];
    if (!Array.isArray(content)) {
      continue;
    }

    let text = extractCodexContentText(content);
    if (role === "user") {
      if (text.trim().length === 0 || text.trimStart().startsWith("<")) {
        continue;
      }

      if (text.includes("<system-reminder>")) {
        text = stripSystemReminders(text);
        if (text.length === 0 || text.trimStart().startsWith("<")) {
          continue;
        }
      }
    } else if (text.trim().length === 0) {
      continue;
    }

    messages.push({
      externalId: String(lineIndex),
      occurredAt: normalizeOccurredAt(record["timestamp"]),
      ordinal: messages.length,
      role,
      text: truncateMessageText(text)
    });
  }

  return messages;
}

export async function locateCodexTranscript(
  threadId: string,
  options?: LocateTranscriptOptions
): Promise<string | null> {
  if (threadId.length === 0) {
    return null;
  }

  const sessionsDir = join(resolveHomeDir(options), ".codex", "sessions");
  const rolloutFiles = await listCodexRolloutFiles(sessionsDir);

  for (const filePath of rolloutFiles) {
    let firstLine: string | null;
    try {
      firstLine = await readFirstLine(filePath);
    } catch {
      continue;
    }

    if (firstLine == null) {
      continue;
    }

    const record = parseJsonObjectLine(firstLine);
    const payload = record?.["payload"];
    if (isRecord(payload) && payload["id"] === threadId) {
      return filePath;
    }
  }

  return null;
}

function extractCodexContentText(content: readonly unknown[]): string {
  const parts: string[] = [];

  for (const item of content) {
    if (isRecord(item) && typeof item["text"] === "string") {
      parts.push(item["text"]);
    }
  }

  return parts.join("");
}

async function listCodexRolloutFiles(sessionsDir: string): Promise<string[]> {
  const files: string[] = [];
  const years = await listSortedSubdirs(sessionsDir);

  for (const year of years) {
    const yearDir = join(sessionsDir, year);
    const months = await listSortedSubdirs(yearDir);

    for (const month of months) {
      const monthDir = join(yearDir, month);
      const days = await listSortedSubdirs(monthDir);

      for (const day of days) {
        const dayDir = join(monthDir, day);
        const dayFiles = await listDayRolloutFiles(dayDir);
        files.push(...dayFiles);
      }
    }
  }

  return files;
}

async function listSortedSubdirs(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left));
  } catch {
    return [];
  }
}

async function listDayRolloutFiles(dayDir: string): Promise<string[]> {
  try {
    const entries = await readdir(dayDir, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith("rollout-") &&
          entry.name.endsWith(".jsonl")
      )
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left))
      .map((name) => join(dayDir, name));
  } catch {
    return [];
  }
}
