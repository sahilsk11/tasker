import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { resolveCodexSessionDisplayTitle } from "./codex-session-title.js";

void test("resolves the latest Codex session index thread name", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-codex-title-"));
  try {
    const sessionIndexPath = join(dir, "session_index.jsonl");
    const statePath = join(dir, "state.sqlite");
    await writeFile(
      sessionIndexPath,
      [
        JSON.stringify({ id: "thread-1", thread_name: "Old Name" }),
        JSON.stringify({ id: "other", thread_name: "Other Name" }),
        JSON.stringify({ id: "thread-1", thread_name: "Fresh Name" })
      ].join("\n")
    );

    assert.equal(
      await resolveCodexSessionDisplayTitle("thread-1", {
        sessionIndexPath,
        statePath
      }),
      "Fresh Name"
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("uses a stored Codex title when it differs from the first message", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-codex-title-"));
  try {
    const sessionIndexPath = join(dir, "missing-session-index.jsonl");
    const statePath = join(dir, "state.sqlite");
    createCodexState(statePath, {
      firstUserMessage: "Investigate the failing migration",
      id: "thread-1",
      preview: "Investigate the failing migration",
      title: "Migration failure"
    });

    assert.equal(
      await resolveCodexSessionDisplayTitle("thread-1", {
        sessionIndexPath,
        statePath
      }),
      "Migration failure"
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("falls back to a cleaned truncated first message", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-codex-title-"));
  try {
    const sessionIndexPath = join(dir, "missing-session-index.jsonl");
    const statePath = join(dir, "state.sqlite");
    const firstMessage =
      "This is a long first message with\nextra spacing that should be cleaned " +
      "before it is shown in the resource card title.";
    createCodexState(statePath, {
      firstUserMessage: firstMessage,
      id: "thread-1",
      preview: firstMessage,
      title: firstMessage
    });

    assert.equal(
      await resolveCodexSessionDisplayTitle("thread-1", {
        sessionIndexPath,
        statePath
      }),
      "This is a long first message with extra spacing that should be cleaned before it is shown in ..."
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("returns null when Codex state is unreadable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-codex-title-"));
  try {
    const sessionIndexPath = join(dir, "missing-session-index.jsonl");
    const statePath = join(dir, "state.sqlite");
    await writeFile(statePath, "not sqlite");

    assert.equal(
      await resolveCodexSessionDisplayTitle("thread-1", {
        sessionIndexPath,
        statePath
      }),
      null
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

function createCodexState(
  statePath: string,
  row: {
    readonly firstUserMessage: string;
    readonly id: string;
    readonly preview: string;
    readonly title: string;
  }
): void {
  const db = new Database(statePath);
  try {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        preview TEXT,
        first_user_message TEXT
      )
    `);
    db.prepare(
      `INSERT INTO threads (id, title, preview, first_user_message)
       VALUES (?, ?, ?, ?)`
    ).run(row.id, row.title, row.preview, row.firstUserMessage);
  } finally {
    db.close();
  }
}
