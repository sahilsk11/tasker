import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "@tasker/api/app";
import { createTaskerRuntime } from "@tasker/api/runtime";
import { NotFoundError, SessionMessageConflictError } from "@tasker/api/service-errors";
import type { PushSessionMessagesRequest, SessionMessage } from "@tasker/core";
import { runCli, type CliRuntime } from "./cli.js";
import type {
  SessionMessagesClient,
  SessionsPushDependencies
} from "./sessions-push.js";

function makeMessages(count: number): SessionMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    externalId: `ext-${String(index)}`,
    occurredAt: "2026-01-01T00:00:00.000Z",
    ordinal: index,
    role: index % 2 === 0 ? "user" : "assistant",
    text: `Message ${String(index)}`
  }));
}

function createFakeRuntime(sessionMessage: SessionMessagesClient): CliRuntime {
  return {
    close: () => Promise.resolve(),
    metadata: {},
    services: {
      sessionMessage,
      task: {} as CliRuntime["services"]["task"]
    }
  };
}

function createFakeDependencies(
  overrides: Partial<SessionsPushDependencies> = {}
): SessionsPushDependencies {
  return {
    locateClaudeTranscript: () => Promise.resolve(null),
    locateCodexTranscript: () => Promise.resolve(null),
    locateT3DbPath: () => Promise.resolve(null),
    readClaudeTranscript: () => Promise.resolve([]),
    readCodexTranscript: () => Promise.resolve([]),
    readT3Thread: () => Promise.resolve([]),
    ...overrides
  };
}

void test("sessions push sends only messages after head.lastOrdinal unless --full is set", async () => {
  const messages = makeMessages(5);
  const pushedBatches: PushSessionMessagesRequest[] = [];
  let headResponse = {
    count: 3,
    lastExternalId: "ext-2",
    lastOrdinal: 2
  };

  const fakeClient: SessionMessagesClient = {
    getHead: () => Promise.resolve(headResponse),
    pushMessages: (_sessionId, input) => {
      pushedBatches.push(input);
      const inserted = input.messages.filter((message) => message.ordinal > 2).length;
      const skipped = input.messages.length - inserted;
      return Promise.resolve({
        inserted,
        skipped,
        total: 5
      });
    }
  };

  const dependencies = createFakeDependencies({
    locateClaudeTranscript: (threadId, options) => {
      assert.equal(threadId, "claude-thread-1");
      assert.deepEqual(options, { homeDir: "/custom/home" });
      return Promise.resolve("/custom/home/.claude/projects/p/claude-thread-1.jsonl");
    },
    readClaudeTranscript: () => Promise.resolve(messages)
  });

  // Tail-only: only ordinals 3 and 4 should be sent.
  const tailResult = await runCli(
    [
      "sessions",
      "push",
      "--session-id",
      "session-1",
      "--harness",
      "claude",
      "--thread-id",
      "claude-thread-1",
      "--home",
      "/custom/home"
    ],
    {},
    {
      createRuntime: () => createFakeRuntime(fakeClient),
      sessionsPushDependencies: dependencies
    }
  );

  assert.equal(tailResult.exitCode, 0);
  assert.equal(pushedBatches.length, 1);
  assert.deepEqual(
    pushedBatches[0]?.messages.map((message) => message.ordinal),
    [3, 4]
  );
  assert.equal(
    tailResult.output,
    [
      "Session messages pushed",
      "Session ID: session-1",
      "Messages read: 5",
      "Messages sent: 2",
      "Inserted: 2",
      "Skipped: 0",
      "Server total: 5"
    ].join("\n")
  );

  // When server already has all messages, tail-only sends 0 chunks.
  pushedBatches.length = 0;
  headResponse = {
    count: 5,
    lastExternalId: "ext-4",
    lastOrdinal: 4
  };
  const noopResult = await runCli(
    [
      "sessions",
      "push",
      "--session-id",
      "session-1",
      "--harness",
      "claude",
      "--thread-id",
      "claude-thread-1",
      "--home",
      "/custom/home"
    ],
    {},
    {
      createRuntime: () => createFakeRuntime(fakeClient),
      sessionsPushDependencies: dependencies
    }
  );
  assert.equal(noopResult.exitCode, 0);
  assert.equal(pushedBatches.length, 0);
  assert.equal(
    noopResult.output,
    [
      "Session messages pushed",
      "Session ID: session-1",
      "Messages read: 5",
      "Messages sent: 0",
      "Inserted: 0",
      "Skipped: 0",
      "Server total: 5"
    ].join("\n")
  );

  // --full sends all 5 messages even though head.lastOrdinal is 4.
  const fullResult = await runCli(
    [
      "sessions",
      "push",
      "--session-id",
      "session-1",
      "--harness",
      "claude",
      "--thread-id",
      "claude-thread-1",
      "--home",
      "/custom/home",
      "--full"
    ],
    {},
    {
      createRuntime: () => createFakeRuntime(fakeClient),
      sessionsPushDependencies: dependencies
    }
  );
  assert.equal(fullResult.exitCode, 0);
  assert.equal(pushedBatches.length, 1);
  assert.deepEqual(
    pushedBatches[0].messages.map((message) => message.ordinal),
    [0, 1, 2, 3, 4]
  );
  assert.equal(
    fullResult.output,
    [
      "Session messages pushed",
      "Session ID: session-1",
      "Messages read: 5",
      "Messages sent: 5",
      "Inserted: 2",
      "Skipped: 3",
      "Server total: 5"
    ].join("\n")
  );
});

void test("sessions push chunks batches larger than 200 messages in order and aggregates totals", async () => {
  const messages = makeMessages(450);
  const chunkSizes: number[] = [];
  const firstOrdinals: number[] = [];
  let runningTotal = 0;

  const fakeClient: SessionMessagesClient = {
    getHead: () =>
      Promise.resolve({
        count: 0,
        lastExternalId: null,
        lastOrdinal: null
      }),
    pushMessages: (_sessionId, input) => {
      chunkSizes.push(input.messages.length);
      firstOrdinals.push(input.messages[0]?.ordinal ?? -1);
      const inserted = input.messages.length - 1;
      const skipped = 1;
      runningTotal += inserted;
      return Promise.resolve({
        inserted,
        skipped,
        total: runningTotal
      });
    }
  };

  const result = await runCli(
    [
      "sessions",
      "push",
      "--session-id",
      "session-chunked",
      "--harness",
      "codex",
      "--thread-id",
      "codex-thread-1",
      "--transcript-path",
      "/tmp/rollout.jsonl"
    ],
    {},
    {
      createRuntime: () => createFakeRuntime(fakeClient),
      sessionsPushDependencies: createFakeDependencies({
        readCodexTranscript: (path) => {
          assert.equal(path, "/tmp/rollout.jsonl");
          return Promise.resolve(messages);
        }
      })
    }
  );

  assert.equal(result.exitCode, 0);
  assert.deepEqual(chunkSizes, [200, 200, 50]);
  assert.deepEqual(firstOrdinals, [0, 200, 400]);
  assert.equal(
    result.output,
    [
      "Session messages pushed",
      "Session ID: session-chunked",
      "Messages read: 450",
      "Messages sent: 450",
      "Inserted: 447",
      "Skipped: 3",
      "Server total: 447"
    ].join("\n")
  );
});

void test("sessions push returns nonzero exit with clear error on 404, 409, and missing transcript", async () => {
  const dependencies = createFakeDependencies({
    locateClaudeTranscript: () => Promise.resolve("/tmp/transcript.jsonl"),
    readClaudeTranscript: () => Promise.resolve(makeMessages(2))
  });

  // 404 unknown session
  const notFoundResult = await runCli(
    [
      "sessions",
      "push",
      "--session-id",
      "missing-session",
      "--harness",
      "claude",
      "--thread-id",
      "thread-1"
    ],
    {},
    {
      createRuntime: () =>
        createFakeRuntime({
          getHead: (sessionId) =>
            Promise.reject(new NotFoundError(`Task session ${sessionId} not found`)),
          pushMessages: () => Promise.reject(new Error("Should not push"))
        }),
      sessionsPushDependencies: dependencies
    }
  );
  assert.equal(notFoundResult.exitCode, 1);
  assert.equal(notFoundResult.output, "Error: Task session missing-session not found");

  // 409 conflicting message content
  const conflictResult = await runCli(
    [
      "sessions",
      "push",
      "--session-id",
      "session-1",
      "--harness",
      "claude",
      "--thread-id",
      "thread-1"
    ],
    {},
    {
      createRuntime: () =>
        createFakeRuntime({
          getHead: () =>
            Promise.resolve({
              count: 1,
              lastExternalId: "ext-0",
              lastOrdinal: null
            }),
          pushMessages: (sessionId) =>
            Promise.reject(new SessionMessageConflictError(sessionId, ["ext-0"]))
        }),
      sessionsPushDependencies: dependencies
    }
  );
  assert.equal(conflictResult.exitCode, 1);
  assert.equal(
    conflictResult.output,
    "Error: Conflicting session messages for session session-1: ext-0"
  );

  // Missing transcript from locator
  const missingLocatorResult = await runCli(
    [
      "sessions",
      "push",
      "--session-id",
      "session-1",
      "--harness",
      "codex",
      "--thread-id",
      "missing-thread"
    ],
    {},
    {
      createRuntime: () =>
        createFakeRuntime({
          getHead: () => Promise.reject(new Error("Should not call getHead")),
          pushMessages: () => Promise.reject(new Error("Should not push"))
        }),
      sessionsPushDependencies: createFakeDependencies()
    }
  );
  assert.equal(missingLocatorResult.exitCode, 1);
  assert.equal(
    missingLocatorResult.output,
    "Error: Codex transcript not found for thread missing-thread"
  );

  // Missing explicit --transcript-path on disk (real fs ENOENT)
  const missingPathResult = await runCli(
    [
      "sessions",
      "push",
      "--session-id",
      "session-1",
      "--harness",
      "t3",
      "--thread-id",
      "thread-1",
      "--transcript-path",
      "/nonexistent/path/statev2.sqlite"
    ],
    {},
    {
      createRuntime: () =>
        createFakeRuntime({
          getHead: () => Promise.reject(new Error("Should not call getHead")),
          pushMessages: () => Promise.reject(new Error("Should not push"))
        })
    }
  );
  assert.equal(missingPathResult.exitCode, 1);
  assert.equal(
    missingPathResult.output,
    "Error: T3 database not found: /nonexistent/path/statev2.sqlite"
  );
});

void test("sessions push persists real transcript messages readable via Fastify API", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-cli-sessions-push-"));
  const databasePath = join(dir, "tasker.sqlite");
  const transcriptPath = join(dir, "claude-thread.jsonl");

  try {
    await writeFile(
      transcriptPath,
      [
        JSON.stringify({
          message: { content: "First user prompt", role: "user" },
          timestamp: "2026-01-01T00:00:00.000Z",
          type: "user",
          uuid: "u-1"
        }),
        JSON.stringify({
          message: {
            content: [{ text: "First assistant reply", type: "text" }],
            role: "assistant"
          },
          timestamp: "2026-01-01T00:00:01.000Z",
          type: "assistant",
          uuid: "a-1"
        })
      ].join("\n"),
      "utf8"
    );

    const runtime = createTaskerRuntime({ databasePath });
    let sessionId: string;
    try {
      const task = await runtime.services.task.createTask({
        description: null,
        parentTaskId: null,
        title: "Push integration task"
      });
      const session = await runtime.services.task.addSession(task.id, {
        provider: "claude"
      });
      sessionId = session.id;
    } finally {
      await runtime.close();
    }

    const firstPush = await runCli(
      [
        "sessions",
        "push",
        "--session-id",
        sessionId,
        "--harness",
        "claude",
        "--thread-id",
        "claude-thread",
        "--transcript-path",
        transcriptPath
      ],
      { DATABASE_PATH: databasePath }
    );
    assert.equal(firstPush.exitCode, 0);
    assert.match(firstPush.output, /Inserted: 2/u);
    assert.match(firstPush.output, /Server total: 2/u);

    const app = await createApp({ databasePath });
    try {
      const headResponse = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/messages/head`
      });
      assert.equal(headResponse.statusCode, 200);
      assert.deepEqual(JSON.parse(headResponse.body), {
        count: 2,
        lastExternalId: "a-1",
        lastOrdinal: 1
      });

      const listResponse = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/messages`
      });
      assert.equal(listResponse.statusCode, 200);
      const page = JSON.parse(listResponse.body) as {
        readonly messages: ReadonlyArray<{
          readonly externalId: string;
          readonly text: string;
        }>;
      };
      assert.deepEqual(
        page.messages.map((message) => ({
          externalId: message.externalId,
          text: message.text
        })),
        [
          { externalId: "u-1", text: "First user prompt" },
          { externalId: "a-1", text: "First assistant reply" }
        ]
      );
    } finally {
      await app.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
