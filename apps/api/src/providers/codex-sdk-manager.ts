import { randomUUID } from "node:crypto";
import {
  Codex,
  type ThreadEvent,
  type ThreadItem,
  type ThreadOptions,
  type Usage
} from "@openai/codex-sdk";
import type {
  ContextWindowUpdatedEntry,
  ResultEntry,
  SystemInitEntry,
  TranscriptEntry
} from "../domain/transcript-entry.js";
import type { NormalizedToolCall, TodoItem } from "../domain/tool-call.js";
import type { HarnessEvent, HarnessTurn } from "../domain/task-session-turn.js";
import type {
  CodexSessionManager,
  StartCodexSessionInput,
  StartCodexTurnInput
} from "./codex-provider.js";

type CodexClient = {
  readonly resumeThread: (id: string, options?: ThreadOptions) => CodexThread;
  readonly startThread: (options?: ThreadOptions) => CodexThread;
};

type CodexThread = {
  readonly id: string | null;
  readonly runStreamed: (
    input: string,
    options?: { readonly signal?: AbortSignal }
  ) => Promise<{ readonly events: AsyncGenerator<ThreadEvent> }>;
};

type NewTranscriptEntry = TranscriptEntry extends infer TEntry
  ? TEntry extends TranscriptEntry
    ? Omit<TEntry, "_id" | "createdAt">
    : never
  : never;

type SessionContext = {
  abortController: AbortController | null;
  readonly cwd: string;
  sessionToken: string | null;
  readonly thread: CodexThread;
};

type CodexSdkManagerArgs = {
  readonly client?: CodexClient;
};

export class CodexSdkManager implements CodexSessionManager {
  private readonly client: CodexClient;
  private readonly sessions = new Map<string, SessionContext>();

  public constructor(args: CodexSdkManagerArgs = {}) {
    this.client = args.client ?? new Codex();
  }

  public startSession(input: StartCodexSessionInput): Promise<string | null> {
    if (input.pendingForkSessionToken != null) {
      return Promise.reject(new Error("Codex SDK sessions cannot be forked yet"));
    }

    const existing = this.sessions.get(input.sessionId);
    if (existing?.cwd === input.cwd) {
      return Promise.resolve(existing.sessionToken);
    }

    if (existing != null) {
      this.stopSession(input.sessionId);
    }

    const threadOptions = toThreadOptions(input);
    const thread = input.sessionToken == null
      ? this.client.startThread(threadOptions)
      : this.client.resumeThread(input.sessionToken, threadOptions);
    const context: SessionContext = {
      abortController: null,
      cwd: input.cwd,
      sessionToken: input.sessionToken,
      thread
    };
    this.sessions.set(input.sessionId, context);

    return Promise.resolve(input.sessionToken);
  }

  public async startTurn(input: StartCodexTurnInput): Promise<HarnessTurn> {
    const context = this.sessions.get(input.sessionId);
    if (context == null) {
      throw new Error("Codex session not started");
    }

    if (context.abortController != null) {
      throw new Error("Codex turn is already running");
    }

    const abortController = new AbortController();
    context.abortController = abortController;
    const streamed = await context.thread.runStreamed(input.content, {
      signal: abortController.signal
    });

    return {
      close: () => {
        context.abortController = null;
      },
      getAccountInfo: () => Promise.resolve(null),
      interrupt: () => {
        abortController.abort();
        context.abortController = null;
        return Promise.resolve();
      },
      provider: "codex",
      stream: streamCodexEvents(context, input, streamed.events, abortController.signal)
    };
  }

  public stopAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId);
    }
  }

  public stopSession(sessionId: string): void {
    const context = this.sessions.get(sessionId);
    if (context == null) {
      return;
    }

    context.abortController?.abort();
    this.sessions.delete(sessionId);
  }
}

async function* streamCodexEvents(
  context: SessionContext,
  input: StartCodexTurnInput,
  events: AsyncGenerator<ThreadEvent>,
  signal: AbortSignal
): AsyncIterable<HarnessEvent> {
  let hasResult = false;
  if (context.sessionToken != null) {
    yield {
      sessionToken: context.sessionToken,
      type: "session_token"
    };
  }

  yield transcript(codexSystemInitEntry(input.model));

  try {
    for await (const event of events) {
      for (const harnessEvent of mapCodexEvent(context, event)) {
        if (harnessEvent.type === "transcript" && harnessEvent.entry.kind === "result") {
          hasResult = true;
        }
        yield harnessEvent;
      }
    }
  } catch (error) {
    if (signal.aborted) {
      yield transcript(makeResultEntry({
        isError: false,
        result: "cancelled",
        subtype: "cancelled"
      }));
      return;
    }

    yield transcript(makeResultEntry({
      isError: true,
      result: error instanceof Error ? error.message : String(error),
      subtype: "error"
    }));
    return;
  } finally {
    context.abortController = null;
  }

  if (!hasResult) {
    yield transcript(makeResultEntry({
      isError: true,
      result: "Codex SDK stream ended without a terminal turn event",
      subtype: "error"
    }));
  }
}

function mapCodexEvent(
  context: SessionContext,
  event: ThreadEvent
): HarnessEvent[] {
  switch (event.type) {
    case "thread.started": {
      context.sessionToken = event.thread_id;
      return [{
        sessionToken: event.thread_id,
        type: "session_token"
      }];
    }
    case "item.started":
    case "item.updated":
    case "item.completed":
      return mapCodexItem(event.item, lifecycleFromEvent(event.type))
        .map((entry) => transcript(entry));
    case "turn.completed":
      return [
        transcript(contextWindowEntry(event.usage)),
        transcript(makeResultEntry({
          isError: false,
          result: "done",
          subtype: "success"
        }))
      ];
    case "turn.failed":
      return [transcript(makeResultEntry({
        isError: true,
        result: event.error.message,
        subtype: "error"
      }))];
    case "error":
      return [transcript(makeResultEntry({
        isError: true,
        result: event.message,
        subtype: "error"
      }))];
    case "turn.started":
      return [];
  }
}

function mapCodexItem(
  item: ThreadItem,
  lifecycle: "completed" | "started" | "updated"
): NewTranscriptEntry[] {
  switch (item.type) {
    case "agent_message":
      return [{
        itemId: item.id,
        kind: "assistant_text",
        lifecycle,
        text: item.text
      }];
    case "reasoning":
      return [{
        display: "collapsed",
        itemId: item.id,
        kind: "reasoning",
        lifecycle,
        text: item.text
      }];
    case "command_execution":
      return mapCommandExecution(item, lifecycle);
    case "mcp_tool_call":
      return mapMcpToolCall(item, lifecycle);
    case "web_search":
      return [toolCallEntry({
        input: { query: item.query },
        kind: "tool",
        rawInput: { query: item.query },
        toolId: item.id,
        toolKind: "web_search",
        toolName: "WebSearch"
      }, lifecycle)];
    case "todo_list":
      return [toolCallEntry({
        input: {
          todos: item.items.map(toTodoItem)
        },
        kind: "tool",
        rawInput: { items: item.items },
        toolId: item.id,
        toolKind: "todo_write",
        toolName: "TodoWrite"
      }, lifecycle)];
    case "file_change":
      return [toolCallEntry({
        input: { payload: item },
        kind: "tool",
        rawInput: { item },
        toolId: item.id,
        toolKind: "unknown_tool",
        toolName: "FileChange"
      }, lifecycle)];
    case "error":
      return [{
        itemId: item.id,
        kind: "status",
        lifecycle,
        status: item.message
      }];
  }
}

function mapCommandExecution(
  item: Extract<ThreadItem, { readonly type: "command_execution" }>,
  lifecycle: "completed" | "started" | "updated"
): NewTranscriptEntry[] {
  const call = toolCallEntry({
    input: {
      command: item.command
    },
    kind: "tool",
    rawInput: {
      aggregatedOutput: item.aggregated_output,
      exitCode: item.exit_code,
      status: item.status
    },
    toolId: item.id,
    toolKind: "bash",
    toolName: "Bash"
  }, lifecycle);

  if (lifecycle !== "completed") {
    return [call];
  }

  return [
    call,
    {
      content: {
        exitCode: item.exit_code ?? null,
        output: item.aggregated_output,
        status: item.status
      },
      isError: item.status === "failed",
      itemId: item.id,
      kind: "tool_result",
      lifecycle,
      toolId: item.id
    }
  ];
}

function mapMcpToolCall(
  item: Extract<ThreadItem, { readonly type: "mcp_tool_call" }>,
  lifecycle: "completed" | "started" | "updated"
): NewTranscriptEntry[] {
  const call = toolCallEntry({
    input: {
      payload: asRecord(item.arguments),
      server: item.server,
      tool: item.tool
    },
    kind: "tool",
    rawInput: {
      arguments: item.arguments,
      status: item.status
    },
    toolId: item.id,
    toolKind: "mcp_generic",
    toolName: item.tool
  }, lifecycle);

  if (lifecycle !== "completed") {
    return [call];
  }

  return [
    call,
    {
      content: item.error ?? item.result ?? null,
      isError: item.status === "failed",
      itemId: item.id,
      kind: "tool_result",
      lifecycle,
      toolId: item.id
    }
  ];
}

function toolCallEntry(
  tool: NormalizedToolCall,
  lifecycle: "completed" | "started" | "updated"
): NewTranscriptEntry {
  return {
    itemId: tool.toolId,
    kind: "tool_call",
    lifecycle,
    tool
  };
}

function codexSystemInitEntry(model: string): Omit<SystemInitEntry, "_id" | "createdAt"> {
  return {
    agents: [],
    kind: "system_init",
    mcpServers: [],
    model,
    provider: "codex",
    slashCommands: [],
    tools: ["bash", "file_change", "mcp_tool_call", "todo_write", "web_search"]
  };
}

function contextWindowEntry(
  usage: Usage
): Omit<ContextWindowUpdatedEntry, "_id" | "createdAt"> {
  const usedTokens = usage.input_tokens + usage.output_tokens;
  return {
    kind: "context_window_updated",
    usage: {
      cachedInputTokens: usage.cached_input_tokens,
      compactsAutomatically: false,
      inputTokens: usage.input_tokens,
      lastCachedInputTokens: usage.cached_input_tokens,
      lastInputTokens: usage.input_tokens,
      lastOutputTokens: usage.output_tokens,
      lastReasoningOutputTokens: usage.reasoning_output_tokens,
      lastUsedTokens: usedTokens,
      outputTokens: usage.output_tokens,
      reasoningOutputTokens: usage.reasoning_output_tokens,
      totalProcessedTokens: usedTokens,
      usedTokens
    }
  };
}

function makeResultEntry(
  entry: Pick<ResultEntry, "isError" | "result" | "subtype">
): Omit<ResultEntry, "_id" | "createdAt"> {
  return {
    durationMs: 0,
    kind: "result",
    ...entry
  };
}

function timestamped(entry: NewTranscriptEntry): TranscriptEntry {
  return {
    _id: randomUUID(),
    createdAt: Date.now(),
    ...entry
  };
}

function transcript(entry: NewTranscriptEntry): HarnessEvent {
  return {
    entry: timestamped(entry),
    type: "transcript"
  };
}

function toThreadOptions(input: StartCodexSessionInput): ThreadOptions {
  const modelReasoningEffort = toReasoningEffort(input.effort);
  return {
    approvalPolicy: "never",
    model: input.model,
    ...(modelReasoningEffort == null ? {} : { modelReasoningEffort }),
    sandboxMode: "danger-full-access",
    skipGitRepoCheck: true,
    workingDirectory: input.cwd
  };
}

function lifecycleFromEvent(
  type: "item.completed" | "item.started" | "item.updated"
): "completed" | "started" | "updated" {
  return type === "item.completed"
    ? "completed"
    : type === "item.updated"
      ? "updated"
      : "started";
}

function toTodoItem(item: { readonly completed: boolean; readonly text: string }): TodoItem {
  return {
    activeForm: item.text,
    content: item.text,
    status: item.completed ? "completed" : "pending"
  };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value != null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : { value };
}

function toReasoningEffort(effort: string | undefined): ThreadOptions["modelReasoningEffort"] {
  return effort === "minimal"
    || effort === "low"
    || effort === "medium"
    || effort === "high"
    || effort === "xhigh"
    ? effort
    : undefined;
}
