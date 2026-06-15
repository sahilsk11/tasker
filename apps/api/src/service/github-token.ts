import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type GitHubTokenSource = {
  readonly name: string;
  readonly token: string;
};

export type GitHubTokenDiscoveryOptions = {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly homeDir?: string | undefined;
};

const tokenEnvKeys = ["GITHUB_TOKEN", "GH_TOKEN"] as const;

export async function discoverGitHubToken(
  options: GitHubTokenDiscoveryOptions = {}
): Promise<GitHubTokenSource | null> {
  const env = options.env ?? process.env;
  for (const key of tokenEnvKeys) {
    const token = normalizeToken(env[key]);
    if (token != null) {
      return { name: key, token };
    }
  }

  const homeDir = options.homeDir ?? env["HOME"];
  if (homeDir == null || homeDir.trim().length === 0) {
    return null;
  }

  return readTokenFromFiles(homeDir);
}

async function readTokenFromFiles(homeDir: string): Promise<GitHubTokenSource | null> {
  const candidates = [
    { host: "github.com", path: join(homeDir, ".config", "gh", "hosts.yml") },
    { host: "github.com", path: join(homeDir, ".config", "gh", "config.yml") },
    { host: "github.com", path: join(homeDir, ".config", "hub") }
  ];

  for (const candidate of candidates) {
    const content = await readFile(candidate.path, "utf8").catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }

      throw error;
    });
    if (content == null) {
      continue;
    }

    const token = parseHostToken(content, candidate.host);
    if (token != null) {
      return { name: candidate.path, token };
    }
  }

  return null;
}

function parseHostToken(content: string, host: string): string | null {
  const lines = content.split(/\r?\n/u);
  let isInHostBlock = false;
  let hostIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (isTopLevelHostLine(trimmed, host)) {
      isInHostBlock = true;
      hostIndent = indent;
      continue;
    }

    if (isInHostBlock && indent <= hostIndent && /^[^:\s]+:/u.test(trimmed)) {
      isInHostBlock = false;
    }

    if (!isInHostBlock) {
      continue;
    }

    const token = parseTokenLine(trimmed);
    if (token != null) {
      return token;
    }
  }

  return null;
}

function isTopLevelHostLine(trimmed: string, host: string): boolean {
  return trimmed === `${host}:` || trimmed === `"${host}":` || trimmed === `'${host}':`;
}

function parseTokenLine(trimmed: string): string | null {
  const match = /^-?\s*oauth_token:\s*(?<value>.+)$/u.exec(trimmed);
  return normalizeToken(match?.groups?.["value"]);
}

function normalizeToken(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim().replace(/^["']|["']$/gu, "");
  return trimmed.length > 0 ? trimmed : null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
