import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { SESSION_MESSAGE_MAX_TEXT_LENGTH, sessionMessageSchema } from "@tasker/core";
import {
  getDefaultT3DbPath,
  locateT3DbPath,
  readT3Thread,
  T3ThreadNotFoundError
} from "./t3.js";

function createTestT3Db(
  dbPath: string,
  options: { readonly includeThreadsTable?: boolean } = {}
): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  if (options.includeThreadsTable !== false) {
    db.exec(`
      CREATE TABLE orchestration_v2_projection_threads (
        thread_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        default_provider TEXT NOT NULL,
        runtime_mode TEXT NOT NULL,
        interaction_mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
  }
  db.exec(`
    CREATE TABLE orchestration_v2_projection_messages (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      run_id TEXT,
      node_id TEXT,
      role TEXT NOT NULL,
      streaming INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      search_text TEXT
    );
  `);
  return db;
}

function insertThread(db: DatabaseSync, threadId: string): void {
  db.prepare(`
    INSERT INTO orchestration_v2_projection_threads
      (thread_id, project_id, title, default_provider, runtime_mode, interaction_mode, created_at, updated_at, payload_json)
    VALUES (?, 'proj-1', 'Synthetic thread', 'claudeAgent', 'full-access', 'default', '2026-11-23T09:00:00.000Z', '2026-11-23T09:00:00.000Z', '{}')
  `).run(threadId);
}

void test("readT3Thread filters strictly by provenance fields, skips empty/invalid rows, and truncates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-t3-test-"));
  const dbPath = join(dir, "statev2.sqlite");

  try {
    const hugeText = `T3START-${"m".repeat(SESSION_MESSAGE_MAX_TEXT_LENGTH + 512)}-T3END`;
    const db = createTestT3Db(dbPath);
    insertThread(db, "thread-1");
    insertThread(db, "thread-other");

    const insert = db.prepare(`
      INSERT INTO orchestration_v2_projection_messages
        (message_id, thread_id, role, streaming, created_at, updated_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Other thread must be ignored.
    insert.run(
      "msg-other-thread",
      "thread-other",
      "user",
      0,
      "2026-11-23T09:00:00.000Z",
      "2026-11-23T09:00:00.000Z",
      JSON.stringify({ createdBy: "user", creationSource: "web", text: "Other thread" })
    );

    // Human user via web (including angle brackets to verify no text-sniffing/stripping).
    insert.run(
      "msg-web",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:01.000Z",
      "2026-11-23T10:00:01.000Z",
      JSON.stringify({
        createdBy: "user",
        creationSource: "web",
        text: "<tag>Human message from web"
      })
    );

    // Assistant reply.
    insert.run(
      "msg-assistant-1",
      "thread-1",
      "assistant",
      0,
      "2026-11-23T10:00:02.000Z",
      "2026-11-23T10:00:02.000Z",
      JSON.stringify({
        createdBy: "agent",
        creationSource: "provider",
        text: "Assistant reply one"
      })
    );

    // Excluded: user row with createdBy='agent' + delegatedCompletion.
    insert.run(
      "msg-agent-delegated",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:03.000Z",
      "2026-11-23T10:00:03.000Z",
      JSON.stringify({
        createdBy: "agent",
        creationSource: "server",
        delegatedCompletion: { taskId: "task-1", status: "completed" },
        text: "Delegated task finished"
      })
    );

    // Excluded: user row with createdBy='agent' + notification.
    insert.run(
      "msg-agent-notification",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:04.000Z",
      "2026-11-23T10:00:04.000Z",
      JSON.stringify({
        createdBy: "agent",
        creationSource: "provider",
        notification: { source: { kind: "monitor" }, summary: "Completed" },
        text: "Background command completed"
      })
    );

    // Excluded: user row with createdBy='agent' + senderThreadId.
    insert.run(
      "msg-agent-sender",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:05.000Z",
      "2026-11-23T10:00:05.000Z",
      JSON.stringify({
        createdBy: "agent",
        creationSource: "mcp",
        senderThreadId: "parent-thread-1",
        text: "Agent-to-agent message"
      })
    );

    // Excluded: user row with createdBy='agent' + workflowScript.
    insert.run(
      "msg-agent-workflow",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:06.000Z",
      "2026-11-23T10:00:06.000Z",
      JSON.stringify({
        createdBy: "agent",
        creationSource: "provider",
        senderThreadId: "workflow-parent",
        text: "Workflow step prompt",
        workflowScript: { id: "wf-1" }
      })
    );

    // Excluded: user row with createdBy='user' + notification (system notice).
    insert.run(
      "msg-user-notification",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:07.000Z",
      "2026-11-23T10:00:07.000Z",
      JSON.stringify({
        createdBy: "user",
        creationSource: "web",
        notification: { outcome: "updated", source: { kind: "system" }, summary: "Resumed thread" },
        text: "Resumed thread"
      })
    );

    // Excluded: user row with createdBy='user' + idleCompaction.
    insert.run(
      "msg-user-idle-compaction",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:08.000Z",
      "2026-11-23T10:00:08.000Z",
      JSON.stringify({
        createdBy: "user",
        creationSource: "web",
        idleCompaction: "onReturn",
        text: "/compact"
      })
    );

    // Human user via mobile.
    insert.run(
      "msg-mobile",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:09.000Z",
      "2026-11-23T10:00:09.000Z",
      JSON.stringify({
        createdBy: "user",
        creationSource: "mobile",
        text: "Human message from mobile"
      })
    );

    // Human user via server.
    insert.run(
      "msg-server",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:10.000Z",
      "2026-11-23T10:00:10.000Z",
      JSON.stringify({
        createdBy: "user",
        creationSource: "server",
        text: "Human message from server"
      })
    );

    // User row with no createdBy field -> defaults to 'user' and is included.
    insert.run(
      "msg-no-created-by",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:11.000Z",
      "2026-11-23T10:00:11.000Z",
      JSON.stringify({
        text: "Legacy user message without createdBy"
      })
    );

    // Non-conversation role, empty/whitespace text, and malformed JSON are skipped.
    insert.run(
      "msg-system-role",
      "thread-1",
      "system",
      0,
      "2026-11-23T10:00:12.000Z",
      "2026-11-23T10:00:12.000Z",
      JSON.stringify({ text: "System notice" })
    );
    insert.run(
      "msg-empty",
      "thread-1",
      "assistant",
      0,
      "2026-11-23T10:00:13.000Z",
      "2026-11-23T10:00:13.000Z",
      JSON.stringify({ text: "   \n\t  " })
    );
    insert.run(
      "msg-bad-json-assistant",
      "thread-1",
      "assistant",
      0,
      "2026-11-23T10:00:14.000Z",
      "2026-11-23T10:00:14.000Z",
      "{not-json"
    );
    insert.run(
      "msg-bad-json-user",
      "thread-1",
      "user",
      0,
      "2026-11-23T10:00:15.000Z",
      "2026-11-23T10:00:15.000Z",
      "{not-json"
    );

    // Oversized assistant message is truncated cleanly.
    insert.run(
      "msg-huge",
      "thread-1",
      "assistant",
      0,
      "2026-11-23T10:00:16.000Z",
      "2026-11-23T10:00:16.000Z",
      JSON.stringify({ createdBy: "agent", creationSource: "provider", text: hugeText })
    );

    db.close();

    const messages = await readT3Thread(dbPath, "thread-1");
    assert.equal(messages.length, 6);

    for (const msg of messages) {
      assert.doesNotThrow(() => sessionMessageSchema.parse(msg));
    }

    assert.deepEqual(
      messages.slice(0, 5),
      [
        {
          externalId: "msg-web",
          occurredAt: "2026-11-23T10:00:01.000Z",
          ordinal: 0,
          role: "user",
          text: "<tag>Human message from web"
        },
        {
          externalId: "msg-assistant-1",
          occurredAt: "2026-11-23T10:00:02.000Z",
          ordinal: 1,
          role: "assistant",
          text: "Assistant reply one"
        },
        {
          externalId: "msg-mobile",
          occurredAt: "2026-11-23T10:00:09.000Z",
          ordinal: 2,
          role: "user",
          text: "Human message from mobile"
        },
        {
          externalId: "msg-server",
          occurredAt: "2026-11-23T10:00:10.000Z",
          ordinal: 3,
          role: "user",
          text: "Human message from server"
        },
        {
          externalId: "msg-no-created-by",
          occurredAt: "2026-11-23T10:00:11.000Z",
          ordinal: 4,
          role: "user",
          text: "Legacy user message without createdBy"
        }
      ]
    );

    const hugeMessage = messages[5];
    assert.ok(hugeMessage != null);
    assert.equal(hugeMessage.externalId, "msg-huge");
    assert.equal(hugeMessage.ordinal, 5);
    assert.equal(hugeMessage.role, "assistant");
    assert.equal(hugeMessage.occurredAt, "2026-11-23T10:00:16.000Z");
    assert.ok(hugeMessage.text.length <= SESSION_MESSAGE_MAX_TEXT_LENGTH);
    assert.match(hugeMessage.text, /^T3START-m+…\[truncated \d+ chars\]$/u);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("readT3Thread stops at the first streaming row and keeps prefix ordinals stable when it completes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-t3-stream-test-"));
  const dbPath = join(dir, "statev2.sqlite");

  try {
    const db = createTestT3Db(dbPath);
    insertThread(db, "thread-stream");

    const insert = db.prepare(`
      INSERT INTO orchestration_v2_projection_messages
        (message_id, thread_id, role, streaming, created_at, updated_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      "m-1",
      "thread-stream",
      "user",
      0,
      "2026-11-23T10:00:01.000Z",
      "2026-11-23T10:00:01.000Z",
      JSON.stringify({ createdBy: "user", creationSource: "web", text: "First prompt" })
    );
    insert.run(
      "m-2",
      "thread-stream",
      "assistant",
      0,
      "2026-11-23T10:00:02.000Z",
      "2026-11-23T10:00:02.000Z",
      JSON.stringify({ createdBy: "agent", creationSource: "provider", text: "First reply" })
    );
    // In-flight streaming assistant message (half-written).
    insert.run(
      "m-3-streaming",
      "thread-stream",
      "assistant",
      1,
      "2026-11-23T10:00:03.000Z",
      "2026-11-23T10:00:03.000Z",
      JSON.stringify({ createdBy: "agent", creationSource: "provider", text: "Partial..." })
    );
    // Later completed user message queued after the streaming assistant row.
    insert.run(
      "m-4-after",
      "thread-stream",
      "user",
      0,
      "2026-11-23T10:00:04.000Z",
      "2026-11-23T10:00:04.000Z",
      JSON.stringify({ createdBy: "user", creationSource: "web", text: "Queued follow-up" })
    );
    db.close();

    // While m-3-streaming has streaming = 1, only m-1 and m-2 are emitted.
    const duringStream = await readT3Thread(dbPath, "thread-stream");
    assert.deepEqual(duringStream, [
      {
        externalId: "m-1",
        occurredAt: "2026-11-23T10:00:01.000Z",
        ordinal: 0,
        role: "user",
        text: "First prompt"
      },
      {
        externalId: "m-2",
        occurredAt: "2026-11-23T10:00:02.000Z",
        ordinal: 1,
        role: "assistant",
        text: "First reply"
      }
    ]);

    // Once m-3-streaming completes, the prefix ordinals/externalIds are unchanged and
    // m-3-streaming + m-4-after are emitted at ordinals 2 and 3.
    const dbUpdate = new DatabaseSync(dbPath);
    dbUpdate
      .prepare(`
        UPDATE orchestration_v2_projection_messages
        SET streaming = 0, payload_json = ?
        WHERE message_id = ?
      `)
      .run(
        JSON.stringify({
          createdBy: "agent",
          creationSource: "provider",
          text: "Complete second reply"
        }),
        "m-3-streaming"
      );
    dbUpdate.close();

    const afterStream = await readT3Thread(dbPath, "thread-stream");
    assert.deepEqual(afterStream.slice(0, 2), duringStream);
    assert.deepEqual(afterStream.slice(2), [
      {
        externalId: "m-3-streaming",
        occurredAt: "2026-11-23T10:00:03.000Z",
        ordinal: 2,
        role: "assistant",
        text: "Complete second reply"
      },
      {
        externalId: "m-4-after",
        occurredAt: "2026-11-23T10:00:04.000Z",
        ordinal: 3,
        role: "user",
        text: "Queued follow-up"
      }
    ]);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("readT3Thread preserves ordinals and externalIds of already-pushed prefix as the thread grows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-t3-grow-test-"));
  const dbPath = join(dir, "statev2.sqlite");

  try {
    const db = createTestT3Db(dbPath);
    insertThread(db, "thread-grow");
    const insert = db.prepare(`
      INSERT INTO orchestration_v2_projection_messages
        (message_id, thread_id, role, streaming, created_at, updated_at, payload_json)
      VALUES (?, ?, ?, 0, ?, ?, ?)
    `);

    insert.run(
      "g-1",
      "thread-grow",
      "user",
      "2026-11-23T10:00:01.000Z",
      "2026-11-23T10:00:01.000Z",
      JSON.stringify({ createdBy: "user", creationSource: "web", text: "Turn 1 user" })
    );
    insert.run(
      "g-2",
      "thread-grow",
      "assistant",
      "2026-11-23T10:00:02.000Z",
      "2026-11-23T10:00:02.000Z",
      JSON.stringify({ createdBy: "agent", creationSource: "provider", text: "Turn 1 assistant" })
    );
    db.close();

    const firstRead = await readT3Thread(dbPath, "thread-grow");
    assert.equal(firstRead.length, 2);

    // Append an excluded agent message plus new human/assistant turns.
    const dbAppend = new DatabaseSync(dbPath);
    const appendStmt = dbAppend.prepare(`
      INSERT INTO orchestration_v2_projection_messages
        (message_id, thread_id, role, streaming, created_at, updated_at, payload_json)
      VALUES (?, ?, ?, 0, ?, ?, ?)
    `);
    appendStmt.run(
      "g-3-agent",
      "thread-grow",
      "user",
      "2026-11-23T10:00:03.000Z",
      "2026-11-23T10:00:03.000Z",
      JSON.stringify({
        createdBy: "agent",
        creationSource: "server",
        delegatedCompletion: { taskId: "d-1" },
        text: "Delegated task result"
      })
    );
    appendStmt.run(
      "g-4",
      "thread-grow",
      "user",
      "2026-11-23T10:00:04.000Z",
      "2026-11-23T10:00:04.000Z",
      JSON.stringify({ createdBy: "user", creationSource: "mobile", text: "Turn 2 user" })
    );
    appendStmt.run(
      "g-5",
      "thread-grow",
      "assistant",
      "2026-11-23T10:00:05.000Z",
      "2026-11-23T10:00:05.000Z",
      JSON.stringify({ createdBy: "agent", creationSource: "provider", text: "Turn 2 assistant" })
    );
    dbAppend.close();

    const secondRead = await readT3Thread(dbPath, "thread-grow");
    assert.equal(secondRead.length, 4);
    assert.deepEqual(secondRead.slice(0, 2), firstRead);
    assert.deepEqual(
      secondRead.slice(2).map((message) => ({
        externalId: message.externalId,
        ordinal: message.ordinal,
        role: message.role
      })),
      [
        { externalId: "g-4", ordinal: 2, role: "user" },
        { externalId: "g-5", ordinal: 3, role: "assistant" }
      ]
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("readT3Thread rejects unknown thread IDs and allows known empty threads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-t3-missing-test-"));
  const dbWithThreadsPath = join(dir, "with-threads.sqlite");
  const dbMessagesOnlyPath = join(dir, "messages-only.sqlite");

  try {
    const dbWithThreads = createTestT3Db(dbWithThreadsPath, { includeThreadsTable: true });
    insertThread(dbWithThreads, "empty-thread");
    dbWithThreads.close();

    assert.deepEqual(await readT3Thread(dbWithThreadsPath, "empty-thread"), []);
    await assert.rejects(
      () => readT3Thread(dbWithThreadsPath, "unknown-thread"),
      (error: unknown) =>
        error instanceof T3ThreadNotFoundError &&
        error.threadId === "unknown-thread" &&
        error.message === "T3 thread not found: unknown-thread"
    );

    const dbMessagesOnly = createTestT3Db(dbMessagesOnlyPath, { includeThreadsTable: false });
    dbMessagesOnly
      .prepare(`
        INSERT INTO orchestration_v2_projection_messages
          (message_id, thread_id, role, streaming, created_at, updated_at, payload_json)
        VALUES ('m-agent', 'agent-only-thread', 'user', 0, '2026-11-23T10:00:00.000Z', '2026-11-23T10:00:00.000Z', ?)
      `)
      .run(JSON.stringify({ createdBy: "agent", text: "Delegated task" }));
    dbMessagesOnly.close();

    assert.deepEqual(await readT3Thread(dbMessagesOnlyPath, "agent-only-thread"), []);
    await assert.rejects(
      () => readT3Thread(dbMessagesOnlyPath, "missing-thread"),
      T3ThreadNotFoundError
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("getDefaultT3DbPath and locateT3DbPath resolve under injectable homeDir", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "tasker-t3-home-"));

  try {
    const expected = join(homeDir, ".t3", "userdata", "statev2.sqlite");
    assert.equal(getDefaultT3DbPath({ homeDir }), expected);
    assert.equal(await locateT3DbPath({ homeDir }), null);

    await mkdir(join(homeDir, ".t3", "userdata"), { recursive: true });
    await writeFile(expected, "", "utf8");

    assert.equal(await locateT3DbPath({ homeDir }), expected);
  } finally {
    await rm(homeDir, { force: true, recursive: true });
  }
});
