import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import SqliteDatabase from "better-sqlite3";
import { createApp } from "../app.js";
import type { AgentProvider } from "../domain/agent-provider.js";
import type { HarnessEvent, HarnessTurn } from "../domain/task-session-turn.js";
import type { TranscriptEntry } from "../domain/transcript-entry.js";
import { ServerProviderRegistry } from "../providers/registry.js";
import type {
  ProviderTurnContext,
  ProviderTurnResult,
  ServerProviderAdapter
} from "../providers/types.js";

void test("session turns persist provider-neutral runtime metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-runtime-events-"));
  const databasePath = join(dir, "tasker.sqlite");
  const app = await createApp({
    databasePath,
    linearApiKey: null,
    providerRegistry: new ServerProviderRegistry([
      ["codex", new FakeProviderAdapter()]
    ])
  });

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Runtime metadata"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (readJson(taskResponse.body) as {
      readonly task: { readonly id: string };
    }).task;

    const sessionResponse = await app.inject({
      method: "POST",
      payload: {
        localPath: dir,
        provider: "codex",
        title: "Codex stream"
      },
      url: `/tasks/${task.id}/sessions`
    });
    assert.equal(sessionResponse.statusCode, 201);
    const session = (readJson(sessionResponse.body) as {
      readonly session: { readonly id: string };
    }).session;

    const messageResponse = await app.inject({
      method: "POST",
      payload: {
        content: "stream the turn"
      },
      url: `/sessions/${session.id}/messages`
    });
    assert.equal(messageResponse.statusCode, 202);

    await waitForSessionIdle(app, task.id, session.id);

    const transcriptResponse = await app.inject({
      method: "GET",
      url: `/sessions/${session.id}/transcript`
    });
    assert.equal(transcriptResponse.statusCode, 200);
    const entries = (readJson(transcriptResponse.body) as {
      readonly entries: TranscriptEntry[];
    }).entries;
    assert.deepEqual(entries.map((entry) => entry.kind), [
      "user_prompt",
      "system_init",
      "tool_call",
      "tool_result",
      "reasoning",
      "assistant_text",
      "result"
    ]);

    const turnIds = new Set(entries.map((entry) => entry.turnId));
    assert.equal(turnIds.size, 1);
    assert.deepEqual(entries.map((entry) => entry.sequence), [1, 2, 3, 4, 5, 6, 7]);

    const toolCall = entries.find((entry) => entry.kind === "tool_call");
    const toolResult = entries.find((entry) => entry.kind === "tool_result");
    const reasoning = entries.find((entry) => entry.kind === "reasoning");
    assert.ok(toolCall);
    assert.ok(toolResult);
    assert.ok(reasoning);
    assert.equal(toolCall.itemId, "tool-1");
    assert.equal(toolCall.lifecycle, "started");
    assert.equal(toolResult.itemId, "tool-1");
    assert.equal(toolResult.lifecycle, "completed");
    assert.equal(reasoning.display, "collapsed");

    const database = new SqliteDatabase(databasePath, { readonly: true });
    try {
      const rows = database
        .prepare(`
          SELECT kind, turn_id, item_id, sequence, lifecycle, display
          FROM task_session_transcript_entries
          WHERE task_session_id = ?
          ORDER BY sequence ASC
        `)
        .all(session.id) as RuntimeMetadataRow[];
      assert.deepEqual(rows.map((row) => row.kind), entries.map((entry) => entry.kind));
      assert.deepEqual(rows.map((row) => row.sequence), [1, 2, 3, 4, 5, 6, 7]);
      const toolCallRow = rows[2];
      const toolResultRow = rows[3];
      const reasoningRow = rows[4];
      assert.ok(toolCallRow);
      assert.ok(toolResultRow);
      assert.ok(reasoningRow);
      assert.equal(toolCallRow.item_id, "tool-1");
      assert.equal(toolCallRow.lifecycle, "started");
      assert.equal(toolResultRow.item_id, "tool-1");
      assert.equal(toolResultRow.lifecycle, "completed");
      assert.equal(reasoningRow.display, "collapsed");
    } finally {
      database.close();
    }

    const secondMessageResponse = await app.inject({
      method: "POST",
      payload: {
        content: "stream the second turn"
      },
      url: `/sessions/${session.id}/runs`
    });
    assert.equal(secondMessageResponse.statusCode, 202);
    await waitForSessionIdle(app, task.id, session.id);

    const chatResponse = await app.inject({
      method: "GET",
      url: `/sessions/${session.id}/chat`
    });
    assert.equal(chatResponse.statusCode, 200);
    const chat = (readJson(chatResponse.body) as {
      readonly snapshot: {
        readonly messages: ReadonlyArray<{
          readonly id: string;
          readonly parts: ReadonlyArray<{ readonly type: string }>;
          readonly role: string;
          readonly turnId: string;
        }>;
      };
    }).snapshot;
    assert.deepEqual(chat.messages.map((message) => message.role), [
      "user",
      "assistant",
      "user",
      "assistant"
    ]);
    assert.equal(new Set(chat.messages.map((message) => message.turnId)).size, 2);
    assert.equal(new Set(chat.messages.map((message) => message.id)).size, 4);
    assert.equal(
      chat.messages
        .filter((message) => message.role === "assistant")
        .every((message) => message.parts.some((part) => part.type === "tool-call")),
      true
    );
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("session turns can be cancelled through the public contract", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-cancel-turn-"));
  const databasePath = join(dir, "tasker.sqlite");
  const app = await createApp({
    databasePath,
    linearApiKey: null,
    providerRegistry: new ServerProviderRegistry([
      ["codex", new FakeProviderAdapter({ waitForInterrupt: true })]
    ])
  });

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Cancel"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (readJson(taskResponse.body) as {
      readonly task: { readonly id: string };
    }).task;

    const sessionResponse = await app.inject({
      method: "POST",
      payload: {
        localPath: dir,
        provider: "codex"
      },
      url: `/tasks/${task.id}/sessions`
    });
    assert.equal(sessionResponse.statusCode, 201);
    const session = (readJson(sessionResponse.body) as {
      readonly session: { readonly id: string };
    }).session;

    const runResponse = await app.inject({
      method: "POST",
      payload: {
        content: "wait"
      },
      url: `/sessions/${session.id}/runs`
    });
    assert.equal(runResponse.statusCode, 202);
    await waitForSessionStatus(app, task.id, session.id, "running");

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/sessions/${session.id}/cancel`
    });
    assert.equal(cancelResponse.statusCode, 202);
    await waitForSessionIdle(app, task.id, session.id);

    const transcriptResponse = await app.inject({
      method: "GET",
      url: `/sessions/${session.id}/transcript`
    });
    const entries = (readJson(transcriptResponse.body) as {
      readonly entries: TranscriptEntry[];
    }).entries;
    const lastEntry = entries.at(-1);
    assert.equal(lastEntry?.kind, "result");
    assert.equal(lastEntry.subtype, "cancelled");
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

type RuntimeMetadataRow = {
  readonly display: string | null;
  readonly item_id: string | null;
  readonly kind: string;
  readonly lifecycle: string | null;
  readonly sequence: number | null;
  readonly turn_id: string | null;
};

type NewTranscriptEntry = TranscriptEntry extends infer TEntry
  ? TEntry extends TranscriptEntry
    ? Omit<TEntry, "_id" | "createdAt">
    : never
  : never;

class FakeProviderAdapter implements ServerProviderAdapter {
  public readonly capabilities = {
    canFork: true,
    drivesTurnViaBackgroundSession: false,
    initialActiveStatus: "starting",
    supportsPlanMode: true
  } as const;
  public readonly id: AgentProvider = "codex";

  public constructor(
    private readonly options: { readonly waitForInterrupt?: boolean } = {}
  ) {}

  public resolveSettings() {
    return {
      model: "fake-codex",
      planMode: false
    };
  }

  public startTurn(context: ProviderTurnContext): Promise<ProviderTurnResult> {
    return Promise.resolve({
      turn: makeHarnessTurn(context.model ?? "fake-codex", this.options)
    });
  }

  public stopAll(): void {
    return undefined;
  }

  public stopChat(): void {
    return undefined;
  }

  public stopSession(): void {
    return undefined;
  }
}

function makeHarnessTurn(
  model: string,
  options: { readonly waitForInterrupt?: boolean } = {}
): HarnessTurn {
  const interruptController = new AbortController();
  return {
    close: () => undefined,
    interrupt: () => {
      interruptController.abort();
      return Promise.resolve();
    },
    provider: "codex",
    stream: makeHarnessEvents(model, interruptController.signal, options)
  };
}

async function* makeHarnessEvents(
  model: string,
  signal: AbortSignal,
  options: { readonly waitForInterrupt?: boolean }
): AsyncIterable<HarnessEvent> {
  await Promise.resolve();

  yield {
    sessionToken: "thread-1",
    type: "session_token"
  };
  yield transcript({
    agents: [],
    kind: "system_init",
    mcpServers: [],
    model,
    provider: "codex",
    slashCommands: [],
    tools: []
  });
  if (options.waitForInterrupt === true) {
    await waitForAbort(signal);
    return;
  }
  yield transcript({
    kind: "tool_call",
    tool: {
      input: {
        command: "pnpm test"
      },
      kind: "tool",
      toolId: "tool-1",
      toolKind: "bash",
      toolName: "Bash"
    }
  });
  yield transcript({
    content: "ok",
    kind: "tool_result",
    toolId: "tool-1"
  });
  yield transcript({
    kind: "reasoning",
    text: "checking the result"
  });
  yield transcript({
    kind: "assistant_text",
    text: "done"
  });
  yield transcript({
    durationMs: 12,
    isError: false,
    kind: "result",
    result: "done",
    subtype: "success"
  });
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function transcript(entry: NewTranscriptEntry): HarnessEvent {
  return {
    entry: {
      _id: randomUUID(),
      createdAt: Date.now(),
      ...entry
    } as TranscriptEntry,
    type: "transcript"
  };
}

async function waitForSessionIdle(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string,
  sessionId: string
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/tasks/${taskId}/sessions`
    });
    const { sessions } = readJson(response.body) as {
      readonly sessions: Array<{ readonly id: string; readonly status: string }>;
    };
    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (session?.status === "idle") {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }

  throw new Error("Timed out waiting for session to become idle");
}

async function waitForSessionStatus(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string,
  sessionId: string,
  status: string
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/tasks/${taskId}/sessions`
    });
    assert.equal(response.statusCode, 200);
    const sessions = (readJson(response.body) as {
      readonly sessions: ReadonlyArray<{ readonly id: string; readonly status: string }>;
    }).sessions;
    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (session?.status === status) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for session ${sessionId} to reach ${status}`);
}

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}
