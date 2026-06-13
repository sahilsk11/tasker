import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  AccountInfo,
  AssistantTextEntry,
  ResultEntry,
  SystemInitEntry,
  TranscriptEntry
} from "../domain/transcript-entry.js";
import type { ToolCallEntry } from "../domain/transcript-entry.js";
import type { AskUserQuestionItem } from "../domain/tool-call.js";
import type { HarnessEvent, HarnessToolRequest, HarnessTurn } from "../domain/task-session-turn.js";
import type {
  CodexSessionManager,
  StartCodexSessionInput,
  StartCodexTurnInput
} from "./codex-provider.js";

type JsonRpcId = string | number;

type JsonRpcResponse = {
  readonly error?: {
    readonly message?: string;
  };
  readonly id: JsonRpcId;
  readonly result?: unknown;
};

type JsonRpcRequest = {
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
};

type JsonRpcNotification = {
  readonly method: string;
  readonly params?: unknown;
};

type PendingRequest = {
  readonly method: string;
  readonly reject: (error: Error) => void;
  readonly resolve: (value: unknown) => void;
};

type SessionContext = {
  readonly child: ChildProcessWithoutNullStreams;
  readonly cwd: string;
  closed: boolean;
  pendingTurn: PendingTurn | null;
  readonly pendingRequests: Map<JsonRpcId, PendingRequest>;
  readonly sessionId: string;
  sessionToken: string | null;
  readonly stderrLines: string[];
};

type PendingTurn = {
  readonly model: string;
  readonly onToolRequest: (request: HarnessToolRequest) => Promise<unknown>;
  readonly queue: AsyncQueue<HarnessEvent>;
  resolved: boolean;
  turnId: string | null;
};

type ThreadResponse = {
  readonly thread?: {
    readonly id?: unknown;
  };
};

type TurnStartResponse = {
  readonly turn?: {
    readonly id?: unknown;
  };
};

export class CodexAppServerManager implements CodexSessionManager {
  private nextRequestId = 1;
  private readonly sessions = new Map<string, SessionContext>();

  public async startSession(input: StartCodexSessionInput): Promise<string | null> {
    const existing = this.sessions.get(input.sessionId);
    if (
      existing != null
      && !existing.closed
      && existing.cwd === input.cwd
      && input.pendingForkSessionToken == null
    ) {
      return existing.sessionToken;
    }

    if (existing != null) {
      this.stopSession(input.sessionId);
    }

    const context = this.createSession(input.sessionId, input.cwd);
    this.sessions.set(input.sessionId, context);
    this.attachListeners(context);

    await this.sendRequest(context, "initialize", {
      capabilities: {
        experimentalApi: true
      },
      clientInfo: {
        name: "tasker_api",
        title: "Tasker",
        version: "0.1.0"
      }
    });
    this.writeMessage(context, {
      method: "initialized"
    });

    const threadParams = {
      approvalPolicy: "never",
      cwd: input.cwd,
      experimentalRawEvents: false,
      model: input.model,
      persistExtendedHistory: false,
      sandbox: "danger-full-access",
      serviceTier: input.serviceTier ?? null
    };

    let response: ThreadResponse;
    if (input.pendingForkSessionToken != null) {
      response = await this.sendRequest<ThreadResponse>(context, "thread/fork", {
        ...threadParams,
        threadId: input.pendingForkSessionToken
      });
    } else if (input.sessionToken != null) {
      try {
        response = await this.sendRequest<ThreadResponse>(context, "thread/resume", {
          approvalPolicy: "never",
          cwd: input.cwd,
          model: input.model,
          persistExtendedHistory: false,
          sandbox: "danger-full-access",
          serviceTier: input.serviceTier ?? null,
          threadId: input.sessionToken
        });
      } catch (error) {
        if (!isRecoverableResumeError(error)) {
          this.stopSession(input.sessionId);
          throw error;
        }
        response = await this.sendRequest<ThreadResponse>(context, "thread/start", threadParams);
      }
    } else {
      response = await this.sendRequest<ThreadResponse>(context, "thread/start", threadParams);
    }

    context.sessionToken = readThreadId(response);
    return context.sessionToken;
  }

  public async startTurn(input: StartCodexTurnInput): Promise<HarnessTurn> {
    const context = this.requireSession(input.sessionId);
    if (context.pendingTurn != null) {
      throw new Error("Codex turn is already running");
    }

    const queue = new AsyncQueue<HarnessEvent>();
    if (context.sessionToken != null) {
      queue.push({
        sessionToken: context.sessionToken,
        type: "session_token"
      });
    }
    queue.push({
      entry: codexSystemInitEntry(input.model),
      type: "transcript"
    });

    const pendingTurn: PendingTurn = {
      model: input.model,
      onToolRequest: input.onToolRequest,
      queue,
      resolved: false,
      turnId: null
    };
    context.pendingTurn = pendingTurn;

    try {
      const response = await this.sendRequest<TurnStartResponse>(context, "turn/start", {
        approvalPolicy: "never",
        collaborationMode: {
          mode: input.planMode ? "plan" : "default",
          settings: {
            developer_instructions: null,
            model: input.model,
            reasoning_effort: null
          }
        },
        effort: input.effort ?? null,
        input: [
          {
            text: input.content,
            text_elements: [],
            type: "text"
          }
        ],
        model: input.model,
        serviceTier: input.serviceTier ?? null,
        threadId: context.sessionToken ?? ""
      });
      pendingTurn.turnId = readTurnId(response);
    } catch (error) {
      context.pendingTurn = null;
      queue.finish();
      throw error;
    }

    return {
      close: () => undefined,
      getAccountInfo: () => Promise.resolve<AccountInfo | null>(null),
      interrupt: async () => {
        const active = context.pendingTurn;
        if (active == null) {
          return;
        }

        context.pendingTurn = null;
        active.resolved = true;
        active.queue.finish();

        if (active.turnId == null || context.sessionToken == null) {
          return;
        }

        await this.sendRequest(context, "turn/interrupt", {
          threadId: context.sessionToken,
          turnId: active.turnId
        });
      },
      provider: "codex",
      stream: queue
    };
  }

  public stopAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId);
    }
  }

  private stopSession(sessionId: string): void {
    const context = this.sessions.get(sessionId);
    if (context == null) {
      return;
    }

    context.closed = true;
    context.pendingTurn?.queue.finish();
    this.rejectPendingRequests(context, new Error("Codex session stopped"));
    this.sessions.delete(sessionId);
    context.child.kill("SIGKILL");
  }

  private createSession(sessionId: string, cwd: string): SessionContext {
    return {
      child: spawn("codex", ["app-server"], {
        cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"]
      }),
      closed: false,
      cwd,
      pendingRequests: new Map(),
      pendingTurn: null,
      sessionId,
      sessionToken: null,
      stderrLines: []
    };
  }

  private requireSession(sessionId: string): SessionContext {
    const context = this.sessions.get(sessionId);
    if (context == null || context.closed) {
      throw new Error("Codex session not started");
    }

    return context;
  }

  private attachListeners(context: SessionContext): void {
    const stdout = createInterface({ input: context.child.stdout });
    void (async () => {
      for await (const line of stdout) {
        const parsed = parseJsonLine(line);
        if (parsed == null) {
          continue;
        }

        if (isJsonRpcResponse(parsed)) {
          this.handleResponse(context, parsed);
          continue;
        }

        if (isJsonRpcRequest(parsed)) {
          void this.handleServerRequest(context, parsed);
          continue;
        }

        if (isJsonRpcNotification(parsed)) {
          this.handleNotification(context, parsed);
        }
      }
    })();

    const stderr = createInterface({ input: context.child.stderr });
    void (async () => {
      for await (const line of stderr) {
        if (line.trim().length > 0) {
          context.stderrLines.push(line.trim());
        }
      }
    })();

    context.child.on("error", (error) => {
      this.failContext(context, error.message);
    });

    context.child.on("close", (code) => {
      if (context.closed) {
        return;
      }

      const message = context.stderrLines.at(-1) ?? `Codex app-server exited with code ${String(code ?? 1)}`;
      this.failContext(context, message);
    });
  }

  private handleResponse(context: SessionContext, response: JsonRpcResponse): void {
    const pending = context.pendingRequests.get(response.id);
    if (pending == null) {
      return;
    }

    context.pendingRequests.delete(response.id);
    if (response.error != null) {
      pending.reject(new Error(`${pending.method} failed: ${response.error.message ?? "Unknown error"}`));
      return;
    }

    pending.resolve(response.result);
  }

  private async handleServerRequest(context: SessionContext, request: JsonRpcRequest): Promise<void> {
    if (request.method === "item/tool/requestUserInput") {
      const pendingTurn = context.pendingTurn;
      if (pendingTurn == null) {
        this.writeMessage(context, {
          error: {
            message: "No active turn"
          },
          id: request.id
        });
        return;
      }

      const params = asRecord(request.params);
      const questions = toAskUserQuestionItems(params?.["questions"]);
      const toolId = typeof params?.["itemId"] === "string" ? params["itemId"] : randomUUID();
      const toolRequest: HarnessToolRequest = {
        tool: {
          input: { questions },
          kind: "tool",
          rawInput: {
            questions
          },
          toolId,
          toolKind: "ask_user_question",
          toolName: "AskUserQuestion"
        }
      };
      pendingTurn.queue.push({
        entry: timestamped<ToolCallEntry>({
          kind: "tool_call",
          tool: toolRequest.tool
        }),
        type: "transcript"
      });

      try {
        const result = await pendingTurn.onToolRequest(toolRequest);
        this.writeMessage(context, {
          id: request.id,
          result: toToolRequestUserInputResponse(result, questions)
        });
      } catch (error) {
        this.failContext(context, error instanceof Error ? error.message : String(error));
      }
      return;
    }

    if (request.method === "item/commandExecution/requestApproval") {
      this.writeMessage(context, {
        id: request.id,
        result: {
          decision: "decline"
        }
      });
      return;
    }

    if (request.method === "item/fileChange/requestApproval") {
      this.writeMessage(context, {
        id: request.id,
        result: {
          decision: "decline"
        }
      });
      return;
    }

    this.writeMessage(context, {
      id: request.id,
      result: {
        contentItems: [
          {
            text: `Unsupported Tasker Codex app-server request: ${request.method}`,
            type: "inputText"
          }
        ],
        success: false
      }
    });
  }

  private handleNotification(context: SessionContext, notification: JsonRpcNotification): void {
    if (notification.method === "thread/started") {
      const thread = asRecord(asRecord(notification.params)?.["thread"]);
      const threadId = thread == null ? null : readThreadId({ thread });
      if (threadId != null) {
        context.sessionToken = threadId;
        context.pendingTurn?.queue.push({
          sessionToken: threadId,
          type: "session_token"
        });
      }
      return;
    }

    const pendingTurn = context.pendingTurn;
    if (pendingTurn == null) {
      return;
    }

    switch (notification.method) {
      case "item/completed": {
        const item = asRecord(asRecord(notification.params)?.["item"]);
        if (item?.["type"] === "agentMessage" && typeof item["text"] === "string") {
          pendingTurn.queue.push({
            entry: timestamped<AssistantTextEntry>({
              kind: "assistant_text",
              text: item["text"]
            }),
            type: "transcript"
          });
        }
        return;
      }

      case "turn/completed": {
        const turn = asRecord(asRecord(notification.params)?.["turn"]);
        const status = typeof turn?.["status"] === "string" ? turn["status"] : "completed";
        const error = asRecord(turn?.["error"]);
        const message = typeof error?.["message"] === "string"
          ? error["message"]
          : status === "completed"
            ? "done"
            : status;

        pendingTurn.queue.push({
          entry: codexResultEntry({
            isError: status === "failed",
            result: message,
            subtype: status === "interrupted" ? "cancelled" : status === "failed" ? "error" : "success"
          }),
          type: "transcript"
        });
        pendingTurn.resolved = true;
        pendingTurn.queue.finish();
        context.pendingTurn = null;
        return;
      }

      case "error": {
        const error = asRecord(notification.params)?.["error"];
        const message = typeof asRecord(error)?.["message"] === "string"
          ? asRecord(error)?.["message"] as string
          : "Codex app-server error";
        this.failContext(context, message);
        return;
      }

      default:
        return;
    }
  }

  private async sendRequest<TResult>(
    context: SessionContext,
    method: string,
    params: unknown
  ): Promise<TResult> {
    const id = this.nextRequestId++;
    const result = new Promise<unknown>((resolve, reject) => {
      context.pendingRequests.set(id, { method, reject, resolve });
    });
    this.writeMessage(context, {
      id,
      method,
      params
    });

    return await result as TResult;
  }

  private writeMessage(context: SessionContext, message: unknown): void {
    context.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private failContext(context: SessionContext, message: string): void {
    if (context.closed) {
      return;
    }

    const error = new Error(message);
    context.closed = true;
    context.pendingTurn?.queue.fail(error);
    this.rejectPendingRequests(context, error);
    this.sessions.delete(context.sessionId);
  }

  private rejectPendingRequests(context: SessionContext, error: Error): void {
    for (const pending of context.pendingRequests.values()) {
      pending.reject(error);
    }
    context.pendingRequests.clear();
  }
}

class AsyncQueue<T> implements AsyncIterable<T> {
  private finished = false;
  private failure: Error | null = null;
  private readonly items: T[] = [];
  private readonly waiters: Array<() => void> = [];

  public push(item: T): void {
    if (this.finished || this.failure != null) {
      return;
    }

    this.items.push(item);
    this.wake();
  }

  public finish(): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    this.wake();
  }

  public fail(error: Error): void {
    if (this.failure != null || this.finished) {
      return;
    }

    this.failure = error;
    this.wake();
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift() as T;
        continue;
      }

      if (this.failure != null) {
        throw this.failure;
      }

      if (this.finished) {
        return;
      }

      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }

  private wake(): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter();
    }
  }
}

function timestamped<TEntry extends TranscriptEntry>(
  entry: Omit<TEntry, "_id" | "createdAt">
): TEntry {
  return {
    _id: randomUUID(),
    createdAt: Date.now(),
    ...entry
  } as TEntry;
}

function codexSystemInitEntry(model: string): SystemInitEntry {
  return timestamped<SystemInitEntry>({
    agents: ["spawnAgent", "sendInput", "resumeAgent", "wait", "closeAgent"],
    kind: "system_init",
    mcpServers: [],
    model,
    provider: "codex",
    slashCommands: [],
    tools: ["Bash", "Write", "Edit", "WebSearch", "TodoWrite", "AskUserQuestion", "ExitPlanMode"]
  });
}

function codexResultEntry(entry: Pick<ResultEntry, "isError" | "result" | "subtype">): ResultEntry {
  return timestamped<ResultEntry>({
    durationMs: 0,
    kind: "result",
    ...entry
  });
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  const record = asRecord(value);
  return record != null && "id" in record && ("result" in record || "error" in record);
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  const record = asRecord(value);
  return record != null && "id" in record && typeof record["method"] === "string";
}

function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  const record = asRecord(value);
  return record != null && !("id" in record) && typeof record["method"] === "string";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toAskUserQuestionItems(value: unknown): readonly AskUserQuestionItem[] {
  return Array.isArray(value)
    ? value.map((entry) => asRecord(entry)).filter((entry): entry is Record<string, unknown> => entry != null).map((entry) => {
        const options = Array.isArray(entry["options"])
          ? entry["options"]
              .map((option) => asRecord(option))
              .filter((option): option is Record<string, unknown> => option != null)
              .map((option) => ({
                ...(typeof option["description"] === "string" ? { description: option["description"] } : {}),
                label: typeof option["label"] === "string" ? option["label"] : ""
              }))
              .filter((option) => option.label.length > 0)
          : undefined;

        return {
          ...(typeof entry["header"] === "string" ? { header: entry["header"] } : {}),
          ...(typeof entry["id"] === "string" ? { id: entry["id"] } : {}),
          ...(options == null ? {} : { options }),
          question: typeof entry["question"] === "string" ? entry["question"] : ""
        };
      }).filter((entry) => entry.question.length > 0)
    : [];
}

function toToolRequestUserInputResponse(
  value: unknown,
  questions: readonly AskUserQuestionItem[]
): Record<string, { readonly answers: readonly string[] }> {
  const record = asRecord(value);
  const answersRecord = asRecord(record?.["answers"]) ?? record ?? {};
  return Object.fromEntries(
    questions.map((question) => {
      const key = question.id ?? question.question;
      const rawAnswer = answersRecord[key] ?? answersRecord[question.question];
      if (Array.isArray(rawAnswer)) {
        return [key, { answers: rawAnswer.map((entry) => String(entry)) }];
      }

      if (typeof rawAnswer === "string") {
        return [key, { answers: [rawAnswer] }];
      }

      const nested = asRecord(rawAnswer);
      const nestedAnswers = nested?.["answers"];
      if (Array.isArray(nestedAnswers)) {
        return [key, { answers: nestedAnswers.map((entry) => String(entry)) }];
      }

      return [key, { answers: [] }];
    })
  );
}

function readThreadId(response: ThreadResponse): string | null {
  const id = response.thread?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function readTurnId(response: TurnStartResponse): string | null {
  const id = response.turn?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function isRecoverableResumeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (!message.includes("thread/resume")) {
    return false;
  }

  return ["not found", "missing thread", "no such thread", "unknown thread", "does not exist"].some((snippet) =>
    message.includes(snippet)
  );
}
