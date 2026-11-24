import {
  SESSION_MESSAGE_MAX_TEXT_LENGTH,
  SESSION_MESSAGES_MAX_PER_PUSH
} from "@tasker/core";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";
import { getDefaultTaskActionsPath } from "../task-actions/catalog.js";

type StoredMessageResponse = {
  readonly contentHash: string;
  readonly createdAt: string;
  readonly externalId: string;
  readonly id: string;
  readonly occurredAt: string | null;
  readonly ordinal: number;
  readonly role: "user" | "assistant";
  readonly sessionId: string;
  readonly text: string;
};

void test("session messages support idempotent push, overlap, conflict rejection, head, and pagination", async () => {
  const { app, cleanup, sessionId } = await createSessionTestContext(
    "tasker-session-messages-"
  );

  try {
    const emptyHeadResponse = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages/head`
    });
    assert.equal(emptyHeadResponse.statusCode, 200);
    assert.deepEqual(readJson(emptyHeadResponse.body), {
      count: 0,
      lastExternalId: null,
      lastOrdinal: null
    });

    const emptyListResponse = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(emptyListResponse.statusCode, 200);
    assert.deepEqual(readJson(emptyListResponse.body), {
      messages: [],
      nextAfter: null
    });

    const initialMessages = [
      {
        externalId: "msg-2",
        occurredAt: "2026-01-01T12:00:01+02:00",
        ordinal: 1,
        role: "assistant" as const,
        text: "Second message"
      },
      {
        externalId: "msg-1",
        occurredAt: "2026-01-01T10:00:00Z",
        ordinal: 0,
        role: "user" as const,
        text: "First message"
      },
      {
        externalId: "msg-3",
        occurredAt: null,
        ordinal: 2,
        role: "user" as const,
        text: "Third message"
      }
    ];

    const firstPush = await app.inject({
      method: "POST",
      payload: { messages: initialMessages },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(firstPush.statusCode, 200);
    assert.deepEqual(readJson(firstPush.body), {
      inserted: 3,
      skipped: 0,
      total: 3
    });

    const headAfterFirst = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages/head`
    });
    assert.equal(headAfterFirst.statusCode, 200);
    assert.deepEqual(readJson(headAfterFirst.body), {
      count: 3,
      lastExternalId: "msg-3",
      lastOrdinal: 2
    });

    // Idempotent re-push of the exact same 3 messages.
    const secondPush = await app.inject({
      method: "POST",
      payload: { messages: initialMessages },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(secondPush.statusCode, 200);
    assert.deepEqual(readJson(secondPush.body), {
      inserted: 0,
      skipped: 3,
      total: 3
    });

    // Partial overlap: 3 existing + 2 new.
    const overlapPush = await app.inject({
      method: "POST",
      payload: {
        messages: [
          ...initialMessages,
          {
            externalId: "msg-4",
            ordinal: 3,
            role: "assistant",
            text: "Fourth message"
          },
          {
            externalId: "msg-5",
            ordinal: 4,
            role: "user",
            text: "Fifth message"
          }
        ]
      },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(overlapPush.statusCode, 200);
    assert.deepEqual(readJson(overlapPush.body), {
      inserted: 2,
      skipped: 3,
      total: 5
    });

    // Conflict: changed text for msg-2 alongside brand-new msg-6 -> 409 and NOTHING inserted.
    const conflictPush = await app.inject({
      method: "POST",
      payload: {
        messages: [
          {
            externalId: "msg-2",
            ordinal: 1,
            role: "assistant",
            text: "Mutated second message"
          },
          {
            externalId: "msg-6",
            ordinal: 5,
            role: "assistant",
            text: "Should not be inserted"
          }
        ]
      },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(conflictPush.statusCode, 409);
    const conflictBody = readJson(conflictPush.body) as {
      readonly conflictingExternalIds: readonly string[];
      readonly error: string;
    };
    assert.deepEqual(conflictBody.conflictingExternalIds, ["msg-2"]);
    assert.match(conflictBody.error, /msg-2/u);

    // Verify count and original content remain untouched after 409.
    const headAfterConflict = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages/head`
    });
    assert.equal(headAfterConflict.statusCode, 200);
    assert.deepEqual(readJson(headAfterConflict.body), {
      count: 5,
      lastExternalId: "msg-5",
      lastOrdinal: 4
    });

    // In-batch conflict with duplicate externalId and differing content -> 409, nothing inserted.
    const inBatchConflict = await app.inject({
      method: "POST",
      payload: {
        messages: [
          {
            externalId: "msg-7",
            ordinal: 6,
            role: "user",
            text: "Version A"
          },
          {
            externalId: "msg-7",
            ordinal: 6,
            role: "user",
            text: "Version B"
          }
        ]
      },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(inBatchConflict.statusCode, 409);
    assert.deepEqual(
      (readJson(inBatchConflict.body) as { readonly conflictingExternalIds: readonly string[] })
        .conflictingExternalIds,
      ["msg-7"]
    );

    // Pagination and ordering (ordinal ASC, created_at ASC; after exclusive).
    const page1Response = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages?limit=2`
    });
    assert.equal(page1Response.statusCode, 200);
    const page1 = readJson(page1Response.body) as {
      readonly messages: readonly StoredMessageResponse[];
      readonly nextAfter: number | null;
    };
    assert.deepEqual(
      page1.messages.map((message) => ({
        externalId: message.externalId,
        ordinal: message.ordinal,
        role: message.role,
        text: message.text
      })),
      [
        { externalId: "msg-1", ordinal: 0, role: "user", text: "First message" },
        { externalId: "msg-2", ordinal: 1, role: "assistant", text: "Second message" }
      ]
    );
    const [firstPageMessage, secondPageMessage] = page1.messages;
    assert.ok(firstPageMessage);
    assert.ok(secondPageMessage);
    assert.equal(
      firstPageMessage.contentHash,
      createHash("sha256").update("First message", "utf8").digest("hex")
    );
    assert.equal(firstPageMessage.occurredAt, "2026-01-01T10:00:00.000Z");
    assert.equal(secondPageMessage.occurredAt, "2026-01-01T10:00:01.000Z");
    assert.equal(page1.nextAfter, 1);

    const page2Response = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages?after=1&limit=2`
    });
    assert.equal(page2Response.statusCode, 200);
    const page2 = readJson(page2Response.body) as {
      readonly messages: readonly StoredMessageResponse[];
      readonly nextAfter: number | null;
    };
    assert.deepEqual(
      page2.messages.map((message) => message.externalId),
      ["msg-3", "msg-4"]
    );
    assert.equal(page2.messages[0]?.occurredAt, null);
    assert.equal(page2.nextAfter, 3);

    const page3Response = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages?after=3&limit=2`
    });
    assert.equal(page3Response.statusCode, 200);
    const page3 = readJson(page3Response.body) as {
      readonly messages: readonly StoredMessageResponse[];
      readonly nextAfter: number | null;
    };
    assert.deepEqual(
      page3.messages.map((message) => message.externalId),
      ["msg-5"]
    );
    assert.equal(page3.nextAfter, null);

    // after=0 is valid and exclusive (skips ordinal 0).
    const afterZeroResponse = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages?after=0&limit=1`
    });
    assert.equal(afterZeroResponse.statusCode, 200);
    const afterZero = readJson(afterZeroResponse.body) as {
      readonly messages: readonly StoredMessageResponse[];
      readonly nextAfter: number | null;
    };
    assert.deepEqual(
      afterZero.messages.map((message) => message.externalId),
      ["msg-2"]
    );
    assert.equal(afterZero.nextAfter, 1);
  } finally {
    await cleanup();
  }
});

void test("session messages reject unknown sessions with 404 and invalid schemas with 400", async () => {
  const { app, cleanup, sessionId } = await createSessionTestContext(
    "tasker-session-messages-validation-"
  );

  try {
    const missingSessionId = randomUUID();

    const missingPush = await app.inject({
      method: "POST",
      payload: {
        messages: [
          {
            externalId: "msg-1",
            ordinal: 0,
            role: "user",
            text: "Hello"
          }
        ]
      },
      url: `/sessions/${missingSessionId}/messages`
    });
    assert.equal(missingPush.statusCode, 404);

    const missingHead = await app.inject({
      method: "GET",
      url: `/sessions/${missingSessionId}/messages/head`
    });
    assert.equal(missingHead.statusCode, 404);

    const missingList = await app.inject({
      method: "GET",
      url: `/sessions/${missingSessionId}/messages`
    });
    assert.equal(missingList.statusCode, 404);

    // Empty messages array -> 400.
    const emptyBatch = await app.inject({
      method: "POST",
      payload: { messages: [] },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(emptyBatch.statusCode, 400);

    // Empty text -> 400.
    const emptyText = await app.inject({
      method: "POST",
      payload: {
        messages: [
          {
            externalId: "msg-empty",
            ordinal: 0,
            role: "user",
            text: ""
          }
        ]
      },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(emptyText.statusCode, 400);

    // Oversize text (> 256,000 chars) -> 400.
    const oversizeText = await app.inject({
      method: "POST",
      payload: {
        messages: [
          {
            externalId: "msg-huge",
            ordinal: 0,
            role: "assistant",
            text: "a".repeat(SESSION_MESSAGE_MAX_TEXT_LENGTH + 1)
          }
        ]
      },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(oversizeText.statusCode, 400);

    // > 200 messages in one push -> 400.
    const tooManyMessages = Array.from(
      { length: SESSION_MESSAGES_MAX_PER_PUSH + 1 },
      (_, index) => ({
        externalId: `msg-${String(index)}`,
        ordinal: index,
        role: index % 2 === 0 ? "user" : "assistant",
        text: `Message ${String(index)}`
      })
    );
    const oversizeBatch = await app.inject({
      method: "POST",
      payload: { messages: tooManyMessages },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(oversizeBatch.statusCode, 400);

    // Invalid query parameters -> 400.
    for (const invalidQuery of [
      "after=-1",
      "after=abc",
      "limit=0",
      "limit=501",
      "limit=1.5"
    ]) {
      const invalidList = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/messages?${invalidQuery}`
      });
      assert.equal(
        invalidList.statusCode,
        400,
        `Expected 400 for query ${invalidQuery}`
      );
    }

    // Exact max batch (200 messages) succeeds across chunks.
    const maxBatch = Array.from(
      { length: SESSION_MESSAGES_MAX_PER_PUSH },
      (_, index) => ({
        externalId: `bulk-${String(index)}`,
        ordinal: index,
        role: index % 2 === 0 ? "user" : "assistant",
        text: `Bulk message ${String(index)}`
      })
    );
    const maxBatchResponse = await app.inject({
      method: "POST",
      payload: { messages: maxBatch },
      url: `/sessions/${sessionId}/messages`
    });
    assert.equal(maxBatchResponse.statusCode, 200);
    assert.deepEqual(readJson(maxBatchResponse.body), {
      inserted: SESSION_MESSAGES_MAX_PER_PUSH,
      skipped: 0,
      total: SESSION_MESSAGES_MAX_PER_PUSH
    });
  } finally {
    await cleanup();
  }
});

async function createSessionTestContext(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = join(dir, "task-actions.json");
  await copyFile(getDefaultTaskActionsPath(), taskActionsPath);

  const app = await createApp({
    databasePath,
    linearApiKey: null,
    taskActionsPath
  });

  const taskResponse = await app.inject({
    method: "POST",
    payload: { title: "Session messages test task" },
    url: "/tasks"
  });
  assert.equal(taskResponse.statusCode, 201);
  const taskId = (readJson(taskResponse.body) as {
    readonly task: { readonly id: string };
  }).task.id;

  const sessionResponse = await app.inject({
    method: "POST",
    payload: { provider: "codex" },
    url: `/tasks/${taskId}/sessions`
  });
  assert.equal(sessionResponse.statusCode, 201);
  const sessionId = (readJson(sessionResponse.body) as {
    readonly session: { readonly id: string };
  }).session.id;

  return {
    app,
    cleanup: async () => {
      await app.close();
      await rm(dir, { force: true, recursive: true });
    },
    sessionId,
    taskId
  };
}

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}
