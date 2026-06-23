import { spawn } from "node:child_process";
import { mkdir, open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { TaskSession } from "../domain/task-session.js";
import { BadRequestError } from "./errors.js";
import type {
  StartedTaskSession,
  StartTaskSessionInput,
  TaskSessionProvider
} from "./session-provider.js";

export type CursorSessionProviderOptions = {
  readonly binPath?: string;
  readonly logRoot?: string;
  readonly model?: string;
  readonly startupTimeoutMs?: number;
};

type CursorInitEvent = {
  readonly session_id?: unknown;
  readonly subtype?: unknown;
  readonly type?: unknown;
};

/**
 * Launches a real Cursor background agent via the `cursor-agent` CLI.
 *
 * The CLI emits a `system/init` stream-json event with a `session_id` immediately
 * on startup, before doing any work. We capture that id (so it can be resumed with
 * `cursor-agent --resume <id>`), then let the agent keep running detached.
 */
export class CursorSessionProvider implements TaskSessionProvider {
  public readonly provider = "cursor";

  private readonly binPath: string;
  private readonly logRoot: string;
  private readonly model: string;
  private readonly startupTimeoutMs: number;

  public constructor(options: CursorSessionProviderOptions = {}) {
    this.binPath = options.binPath ?? defaultCursorBinPath();
    this.logRoot = options.logRoot ?? defaultCursorLogRoot();
    this.model = options.model ?? "composer-2.5";
    this.startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
  }

  public async startSession(
    input: StartTaskSessionInput
  ): Promise<StartedTaskSession> {
    await mkdir(this.logRoot, { recursive: true });
    const logPath = join(this.logRoot, `${input.session.id}.log`);

    const cursorSessionId = await this.spawnAgent({
      logPath,
      prompt: input.prompt,
      workingPath: input.workingPath
    });

    const metadata = {
      agentModel: this.model,
      agentProvider: this.provider,
      cursorSessionId,
      logPath,
      projectPath: input.workingPath,
      requestedAgentProvider: input.requestedAgentProvider ?? this.provider,
      resumeCommand: `cursor-agent --resume ${cursorSessionId}`,
      taskerSessionId: input.session.id
    };

    return {
      launch: {
        metadata,
        openUrl: null,
        provider: this.provider
      }
    };
  }

  public enrichSession(session: TaskSession): Promise<TaskSession> {
    const cursorSessionId =
      session.providerId ?? getStringMetadata(session, "cursorSessionId");
    if (cursorSessionId == null) {
      return Promise.resolve(session);
    }

    return Promise.resolve({
      ...session,
      displayTitle: session.displayTitle ?? `Cursor session ${cursorSessionId}`
    });
  }

  private async spawnAgent({
    logPath,
    prompt,
    workingPath
  }: {
    readonly logPath: string;
    readonly prompt: string;
    readonly workingPath: string;
  }): Promise<string> {
    // Point the child's stdout+stderr straight at the log file so the kernel owns
    // the sink. The agent then runs fully detached from this process and keeps
    // streaming output even after we return (and even if the API restarts).
    const logFile = await open(logPath, "a");
    let child;
    try {
      child = spawn(
        this.binPath,
        [
          "--print",
          "--output-format",
          "stream-json",
          "--force",
          "--model",
          this.model,
          prompt
        ],
        {
          cwd: workingPath,
          detached: true,
          stdio: ["ignore", logFile.fd, logFile.fd]
        }
      );
    } finally {
      await logFile.close();
    }

    const exited = trackEarlyExit(child);
    // Detach so the agent keeps running independently of this process.
    child.unref();

    return this.awaitSessionId(logPath, exited);
  }

  private async awaitSessionId(
    logPath: string,
    exited: EarlyExit
  ): Promise<string> {
    const deadline = Date.now() + this.startupTimeoutMs;
    const pollIntervalMs = 100;

    while (Date.now() < deadline) {
      const sessionId = await readCursorSessionId(logPath);
      if (sessionId != null) {
        return sessionId;
      }

      if (exited.error != null) {
        throw new BadRequestError(
          `Failed to launch Cursor agent (${this.binPath}): ${exited.error.message}`
        );
      }

      // Only treat an exit as fatal once the log has been given a chance to flush.
      if (exited.code != null) {
        const finalSessionId = await readCursorSessionId(logPath);
        if (finalSessionId != null) {
          return finalSessionId;
        }
        throw new BadRequestError(
          `Cursor agent exited before reporting a session id (code ${String(exited.code)})`
        );
      }

      await delay(pollIntervalMs);
    }

    throw new BadRequestError(
      "Timed out waiting for the Cursor agent to report a session id"
    );
  }
}

type EarlyExit = {
  code: number | null;
  error: Error | null;
};

function trackEarlyExit(child: ReturnType<typeof spawn>): EarlyExit {
  const state: EarlyExit = { code: null, error: null };
  child.once("error", (error: Error) => {
    state.error = error;
  });
  child.once("exit", (code) => {
    state.code = code ?? 0;
  });
  return state;
}

async function readCursorSessionId(logPath: string): Promise<string | null> {
  const contents = await readFile(logPath, "utf8").catch(() => null);
  if (contents == null) {
    return null;
  }

  for (const line of contents.split("\n")) {
    const sessionId = parseCursorInitSessionId(line);
    if (sessionId != null) {
      return sessionId;
    }
  }

  return null;
}

function parseCursorInitSessionId(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }

  if (parsed == null || typeof parsed !== "object") {
    return null;
  }

  const event = parsed as CursorInitEvent;
  if (
    event.type === "system" &&
    event.subtype === "init" &&
    typeof event.session_id === "string" &&
    event.session_id.length > 0
  ) {
    return event.session_id;
  }

  return null;
}

function getStringMetadata(session: TaskSession, key: string): string | null {
  const value = session.metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function defaultCursorBinPath(): string {
  return join(homedir(), ".local", "bin", "cursor-agent");
}

function defaultCursorLogRoot(): string {
  return join(homedir(), ".tasker", "cursor-sessions");
}
