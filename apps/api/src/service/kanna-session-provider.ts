import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TaskSession } from "../domain/task-session.js";
import { BadRequestError } from "./errors.js";
import type {
  StartedTaskSession,
  StartTaskSessionInput,
  TaskSessionProvider
} from "./session-provider.js";

/**
 * Hard-coded default model per Kanna agent provider.
 * Each provider gets a sensible default so the model field is always provider-appropriate.
 */
export const PROVIDER_DEFAULT_MODELS: Readonly<Record<string, string>> = {
  claude: "claude-sonnet-4-5",
  codex: "gpt-5.5",
  cursor: "cursor-small"
};

/**
 * Returns the default model for a given Kanna agent provider,
 * falling back to `fallbackModel` for unknown providers.
 */
export function resolveModelForProvider(provider: string, fallbackModel: string): string {
  return PROVIDER_DEFAULT_MODELS[provider] ?? fallbackModel;
}

type KannaCommand = {
  readonly [key: string]: unknown;
  readonly type: string;
};

type KannaEnvelope =
  | { readonly v: 1; readonly type: "ack"; readonly id: string; readonly result?: unknown }
  | { readonly v: 1; readonly type: "error"; readonly id?: string; readonly message: string };

type KannaMessage = KannaEnvelope | { readonly v: 1; readonly type: string; readonly id?: string };

export type KannaSessionProviderOptions = {
  readonly agentModel?: string;
  readonly agentProvider?: string;
  readonly baseUrl?: string;
  readonly chatsLogPath?: string;
  readonly codexFastMode?: boolean;
  readonly codexReasoningEffort?: string;
  readonly timeoutMs?: number;
};

export class KannaSessionProvider implements TaskSessionProvider {
  public readonly provider = "kanna";

  private readonly agentModel: string;
  private readonly agentProvider: string;
  private readonly baseUrl: string;
  private readonly chatsLogPath: string;
  private readonly codexFastMode: boolean;
  private readonly codexReasoningEffort: string;
  private readonly timeoutMs: number;

  public constructor(options: KannaSessionProviderOptions = {}) {
    this.agentModel = options.agentModel ?? "gpt-5.5";
    this.agentProvider = options.agentProvider ?? "codex";
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "http://127.0.0.1:3210");
    this.chatsLogPath = options.chatsLogPath ?? defaultKannaChatsLogPath();
    this.codexFastMode = options.codexFastMode ?? false;
    this.codexReasoningEffort = options.codexReasoningEffort ?? "high";
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  public async startSession(
    input: StartTaskSessionInput
  ): Promise<StartedTaskSession> {
    await this.requireHealthyBackend();
    const requestedAgentProvider = input.requestedAgentProvider ?? this.agentProvider;
    const agentProvider = toKannaAgentProvider(requestedAgentProvider);
    const agentModel = resolveModelForProvider(agentProvider, this.agentModel);

    const socket = await openKannaSocket(this.baseUrl, this.timeoutMs);
    try {
      const project = await sendCommand<{ readonly projectId: string }>(
        socket,
        { type: "project.open", localPath: input.workingPath },
        this.timeoutMs
      );
      const modelOptions = {
        codex: {
          fastMode: this.codexFastMode,
          reasoningEffort: this.codexReasoningEffort
        }
      };
      const launched = await sendCommand<{ readonly chatId?: string }>(
        socket,
        {
          type: "chat.send",
          content: input.prompt,
          model: agentModel,
          modelOptions,
          projectId: project.projectId,
          provider: agentProvider
        },
        this.timeoutMs
      );

      if (launched.chatId == null || launched.chatId.length === 0) {
        throw new BadRequestError("Kanna did not return a launched chat id");
      }

      const metadata = {
        agentModel,
        agentProvider,
        backendUrl: this.baseUrl,
        kannaChatId: launched.chatId,
        kannaProjectId: project.projectId,
        modelOptions,
        projectPath: input.workingPath,
        requestedAgentProvider,
        taskerSessionId: input.session.id
      };

      return {
        launch: {
          metadata,
          openUrl: `${this.baseUrl}/chat/${encodeURIComponent(launched.chatId)}`,
          provider: this.provider
        }
      };
    } finally {
      socket.close();
    }
  }

  public async enrichSession(session: TaskSession): Promise<TaskSession> {
    const chatId = session.providerId ?? getStringMetadata(session, "kannaChatId");
    if (chatId == null) {
      return session;
    }

    const displayTitle =
      (await resolveKannaChatTitle(chatId, this.chatsLogPath)) ?? `Kanna chat ${chatId}`;

    return {
      ...session,
      displayTitle: session.displayTitle ?? displayTitle
    };
  }

  private async requireHealthyBackend(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/health`).catch((error: unknown) => {
      throw new BadRequestError(
        `Kanna backend is unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
    });

    if (!response.ok) {
      throw new BadRequestError(
        `Kanna backend health check failed with HTTP ${String(response.status)}`
      );
    }
  }
}

async function openKannaSocket(baseUrl: string, timeoutMs: number): Promise<WebSocket> {
  const socket = new WebSocket(toWebSocketUrl(baseUrl));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new BadRequestError("Timed out connecting to Kanna websocket"));
    }, timeoutMs);

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve(socket);
      },
      { once: true }
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new BadRequestError("Failed to connect to Kanna websocket"));
      },
      { once: true }
    );
  });
}

async function sendCommand<TResult>(
  socket: WebSocket,
  command: KannaCommand,
  timeoutMs: number
): Promise<TResult> {
  const id = randomUUID();
  const envelope = { v: 1, type: "command", id, command };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new BadRequestError(`Kanna command ${command.type} timed out`));
    }, timeoutMs);

    const handleMessage = (event: MessageEvent) => {
      const message = parseKannaEnvelope(event.data);
      if (message?.id !== id) {
        return;
      }

      cleanup();
      if (message.type === "error" && "message" in message) {
        reject(new BadRequestError(message.message));
        return;
      }

      if (message.type !== "ack") {
        reject(new BadRequestError(`Unexpected Kanna response: ${message.type}`));
        return;
      }

      resolve((("result" in message ? message.result : undefined) ?? {}) as TResult);
    };
    const handleError = () => {
      cleanup();
      reject(new BadRequestError(`Kanna command ${command.type} failed`));
    };

    function cleanup(): void {
      clearTimeout(timeout);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("error", handleError);
    }

    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", handleError, { once: true });
    socket.send(JSON.stringify(envelope));
  });
}

function parseKannaEnvelope(value: unknown): KannaMessage | null {
  const raw =
    typeof value === "string"
      ? value
      : value instanceof Buffer
        ? value.toString("utf8")
        : null;
  if (raw == null) {
    return null;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (parsed == null || typeof parsed !== "object") {
    return null;
  }

  return parsed as KannaEnvelope;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}

function toWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getStringMetadata(session: TaskSession, key: string): string | null {
  const value = session.metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toKannaAgentProvider(provider: string): string {
  return provider === "claude-code" ? "claude" : provider;
}

function defaultKannaChatsLogPath(): string {
  return join(homedir(), ".kanna", "data", "chats.jsonl");
}

async function resolveKannaChatTitle(
  chatId: string,
  chatsLogPath: string
): Promise<string | null> {
  const contents = await readFile(chatsLogPath, "utf8").catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  });
  if (contents == null) {
    return null;
  }

  let title: string | null = null;
  for (const line of contents.split("\n")) {
    const event = parseKannaChatEvent(line);
    if (event?.chatId !== chatId) {
      continue;
    }

    title = event.title;
  }

  return title;
}

function parseKannaChatEvent(line: string):
  | { readonly chatId: string; readonly title: string; readonly type: "chat_created" | "chat_renamed" }
  | null {
  if (line.trim().length === 0) {
    return null;
  }

  const parsed = parseJsonLine(line);
  if (parsed == null || typeof parsed !== "object") {
    return null;
  }

  const event = parsed as Record<string, unknown>;
  if (
    (event["type"] !== "chat_created" && event["type"] !== "chat_renamed") ||
    typeof event["chatId"] !== "string" ||
    typeof event["title"] !== "string"
  ) {
    return null;
  }

  const title = event["title"].trim();
  if (title.length === 0) {
    return null;
  }

  return {
    chatId: event["chatId"],
    title,
    type: event["type"]
  };
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
