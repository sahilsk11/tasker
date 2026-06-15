import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

export type CodexTranscriptDiscovery = {
  readonly sessionsRoot: string;
};

export function defaultCodexSessionsRoot(): string {
  return join(homedir(), ".codex", "sessions");
}

export async function resolveCodexTranscriptPath(
  providerId: string,
  options: CodexTranscriptDiscovery
): Promise<string | null> {
  const candidates = await findJsonlFilesContaining(options.sessionsRoot, providerId);

  for (const candidate of candidates) {
    if (await hasMatchingSessionMeta(candidate, providerId)) {
      return candidate;
    }
  }

  return null;
}

async function findJsonlFilesContaining(
  directory: string,
  providerId: string
): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingDirectoryError(error)) {
      return [];
    }
    throw error;
  }

  const matches = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return findJsonlFilesContaining(path, providerId);
      }

      if (entry.isFile() && entry.name.includes(providerId) && entry.name.endsWith(".jsonl")) {
        return [path];
      }

      return [];
    })
  );

  return matches.flat();
}

async function hasMatchingSessionMeta(path: string, providerId: string): Promise<boolean> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ crlfDelay: Number.POSITIVE_INFINITY, input: stream });

  try {
    for await (const line of lines) {
      const parsed = parseJsonObject(line);
      return (
        parsed?.["type"] === "session_meta" &&
        getPayloadId(parsed) === providerId
      );
    }
  } finally {
    lines.close();
    stream.destroy();
  }

  return false;
}

function getPayloadId(value: Record<string, unknown>): string | null {
  const payload = value["payload"];
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const id = (payload as Record<string, unknown>)["id"];
  return typeof id === "string" ? id : null;
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

function isMissingDirectoryError(error: unknown): boolean {
  return (
    error != null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  );
}
