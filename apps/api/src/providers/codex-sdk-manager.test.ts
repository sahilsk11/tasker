import test from "node:test";
import assert from "node:assert/strict";
import type { ThreadEvent } from "@openai/codex-sdk";
import type { HarnessEvent } from "../domain/task-session-turn.js";
import { CodexSdkManager } from "./codex-sdk-manager.js";

void test("CodexSdkManager maps SDK stream items into Tasker transcript entries", async () => {
  const client = new FakeCodexClient([
    {
      thread_id: "thread-1",
      type: "thread.started"
    },
    {
      type: "turn.started"
    },
    {
      item: {
        aggregated_output: "",
        command: "pwd",
        id: "cmd-1",
        status: "in_progress",
        type: "command_execution"
      },
      type: "item.started"
    },
    {
      item: {
        aggregated_output: "/tmp/tasker\n",
        command: "pwd",
        exit_code: 0,
        id: "cmd-1",
        status: "completed",
        type: "command_execution"
      },
      type: "item.completed"
    },
    {
      item: {
        id: "reasoning-1",
        text: "Checked the current directory.",
        type: "reasoning"
      },
      type: "item.completed"
    },
    {
      item: {
        id: "message-1",
        text: "done",
        type: "agent_message"
      },
      type: "item.completed"
    },
    {
      type: "turn.completed",
      usage: {
        cached_input_tokens: 2,
        input_tokens: 10,
        output_tokens: 4,
        reasoning_output_tokens: 3
      }
    }
  ]);
  const manager = new CodexSdkManager({ client });

  const sessionToken = await manager.startSession({
    cwd: "/tmp/tasker",
    model: "gpt-5.5",
    pendingForkSessionToken: null,
    sessionId: "session-1",
    sessionToken: null
  });
  assert.equal(sessionToken, null);

  const turn = await manager.startTurn({
    content: "inspect",
    model: "gpt-5.5",
    onToolRequest: () => Promise.resolve(null),
    planMode: false,
    sessionId: "session-1"
  });
  const events = await collect(turn.stream);

  assert.deepEqual(events.map((event) => event.type), [
    "transcript",
    "session_token",
    "transcript",
    "transcript",
    "transcript",
    "transcript",
    "transcript",
    "transcript",
    "transcript"
  ]);
  assert.deepEqual(
    events
      .filter((event): event is Extract<HarnessEvent, { readonly type: "transcript" }> => (
        event.type === "transcript"
      ))
      .map((event) => event.entry.kind),
    [
      "system_init",
      "tool_call",
      "tool_call",
      "tool_result",
      "reasoning",
      "assistant_text",
      "context_window_updated",
      "result"
    ]
  );

  const commandResult = events.find((event) => (
    event.type === "transcript" && event.entry.kind === "tool_result"
  ));
  assert.equal(commandResult?.type, "transcript");
  assert.equal(commandResult.entry.kind, "tool_result");
  assert.equal(commandResult.entry.toolId, "cmd-1");
  assert.equal(commandResult.entry.lifecycle, "completed");

  const reasoning = events.find((event) => (
    event.type === "transcript" && event.entry.kind === "reasoning"
  ));
  assert.equal(reasoning?.type, "transcript");
  assert.equal(reasoning.entry.kind, "reasoning");
  assert.equal(reasoning.entry.display, "collapsed");
});

class FakeCodexClient {
  public constructor(private readonly events: readonly ThreadEvent[]) {}

  public startThread(): FakeCodexThread {
    return new FakeCodexThread(this.events);
  }

  public resumeThread(): FakeCodexThread {
    return new FakeCodexThread(this.events);
  }
}

class FakeCodexThread {
  public readonly id = null;

  public constructor(private readonly events: readonly ThreadEvent[]) {}

  public runStreamed(): Promise<{ readonly events: AsyncGenerator<ThreadEvent> }> {
    return Promise.resolve({
      events: makeEvents(this.events)
    });
  }
}

async function* makeEvents(
  events: readonly ThreadEvent[]
): AsyncGenerator<ThreadEvent> {
  await Promise.resolve();
  for (const event of events) {
    yield event;
  }
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}
