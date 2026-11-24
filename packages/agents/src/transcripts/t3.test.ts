import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { SESSION_MESSAGE_MAX_TEXT_LENGTH, sessionMessageSchema } from "@tasker/core";
import { getDefaultT3DbPath, locateT3DbPath, readT3Thread } from "./t3.js";

function createTestT3Db(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
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
      payload_json TEXT NOT NULL
    );
  `);
  return db;
}

void test("readT3Thread reads user/assistant rows in order, filters noise, truncates, and preserves externalIds on append", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-t3-test-"));
  const dbPath = join(dir, "statev2.sqlite");

  try {
    const hugeText = `T3START-${"m".repeat(SESSION_MESSAGE_MAX_TEXT_LENGTH + 512)}-T3END`;
    const db = createTestT3Db(dbPath);
    const insert = db.prepare(`
      INSERT INTO orchestration_v2_projection_messages
        (message_id, thread_id, role, streaming, created_at, updated_at, payload_json)
      VALUES (?, ?, ?, 0, ?, ?, ?)
    `);

    insert.run(
      "msg-other-thread",
      "thread-other",
      "user",
      "2026-11-23T09:00:00.000Z",
      "2026-11-23T09:00:00.000Z",
      JSON.stringify({ text: "Belongs to another thread" })
    );
    insert.run(
      "msg-system-role",
      "thread-1",
      "system",
      "2026-11-23T10:00:00.000Z",
      "2026-11-23T10:00:00.000Z",
      JSON.stringify({ text: "System notice" })
    );
    insert.run(
      "msg-empty",
      "thread-1",
      "assistant",
      "2026-11-23T10:00:01.000Z",
      "2026-11-23T10:00:01.000Z",
      JSON.stringify({ text: "   " })
    );
    insert.run(
      "msg-bad-json",
      "thread-1",
      "assistant",
      "2026-11-23T10:00:02.000Z",
      "2026-11-23T10:00:02.000Z",
      "{not-json"
    );
    insert.run(
      "msg-2",
      "thread-1",
      "assistant",
      "2026-11-23T10:00:10.000Z",
      "2026-11-23T10:00:10.000Z",
      JSON.stringify({ text: hugeText })
    );
    insert.run(
      "msg-1",
      "thread-1",
      "user",
      "2026-11-23T10:00:05.000Z",
      "2026-11-23T10:00:05.000Z",
      JSON.stringify({
        text: "<system-reminder>skip</system-reminder>\nPlease summarize the PR"
      })
    );
    db.close();

    const firstRead = await readT3Thread(dbPath, "thread-1");
    assert.equal(firstRead.length, 2);

    for (const msg of firstRead) {
      assert.doesNotThrow(() => sessionMessageSchema.parse(msg));
    }

    assert.deepEqual(firstRead[0], {
      externalId: "msg-1",
      occurredAt: "2026-11-23T10:00:05.000Z",
      ordinal: 0,
      role: "user",
      text: "Please summarize the PR"
    });

    const hugeMessage = firstRead[1];
    assert.ok(hugeMessage != null);
    assert.equal(hugeMessage.externalId, "msg-2");
    assert.equal(hugeMessage.ordinal, 1);
    assert.equal(hugeMessage.role, "assistant");
    assert.equal(hugeMessage.occurredAt, "2026-11-23T10:00:10.000Z");
    assert.ok(hugeMessage.text.length <= SESSION_MESSAGE_MAX_TEXT_LENGTH);
    assert.match(hugeMessage.text, /^T3START-m+…\[truncated \d+ chars\]$/u);

    // Append another message row and verify earlier externalIds and ordinals stay stable.
    const dbAppend = new DatabaseSync(dbPath);
    dbAppend
      .prepare(
        `
        INSERT INTO orchestration_v2_projection_messages
          (message_id, thread_id, role, streaming, created_at, updated_at, payload_json)
        VALUES (?, ?, ?, 0, ?, ?, ?)
      `
      )
      .run(
        "msg-3",
        "thread-1",
        "user",
        "2026-11-23T10:01:00.000Z",
        "2026-11-23T10:01:00.000Z",
        JSON.stringify({ text: "Looks good" })
      );
    dbAppend.close();

    const secondRead = await readT3Thread(dbPath, "thread-1");
    assert.equal(secondRead.length, 3);
    assert.deepEqual(secondRead.slice(0, 2), firstRead);
    assert.deepEqual(secondRead[2], {
      externalId: "msg-3",
      occurredAt: "2026-11-23T10:01:00.000Z",
      ordinal: 2,
      role: "user",
      text: "Looks good"
    });
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
