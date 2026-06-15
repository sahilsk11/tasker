import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import SqliteDatabase from "better-sqlite3";
import { migrate } from "./migrate.js";

const migrationsDirectory = new URL("../../migrations", import.meta.url).pathname;

void test("migrations upgrade legacy sessions and remain idempotent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-migrate-"));
  const databasePath = join(dir, "tasker.sqlite");

  try {
    seedLegacySessionDatabase(databasePath);

    migrate({ databasePath, migrationsDirectory });
    migrate({ databasePath, migrationsDirectory });

    const database = new SqliteDatabase(databasePath);
    try {
      const sessions = database
        .prepare(
          `
            SELECT action_id, provider_id, transcript_path, metadata_json, claimed_at
            FROM task_sessions
            ORDER BY id
          `
        )
        .all();

      assert.deepEqual(sessions, [
        {
          action_id: null,
          provider_id: null,
          transcript_path: null,
          metadata_json: null,
          claimed_at: "2026-01-01T00:00:00.000Z"
        },
        {
          action_id: null,
          provider_id: null,
          transcript_path: null,
          metadata_json: null,
          claimed_at: "2026-01-01T00:00:01.000Z"
        }
      ]);

      const appliedVersions = database
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => (row as { version: string }).version);

      assert.deepEqual(appliedVersions, [
        "000001_initial",
        "000004_task_session_tracking_metadata"
      ]);
    } finally {
      database.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

function seedLegacySessionDatabase(databasePath: string): void {
  const database = new SqliteDatabase(databasePath);
  try {
    database.exec(`
      CREATE TABLE schema_migrations (
        version text PRIMARY KEY,
        applied_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
    database.exec(readFileSync(join(migrationsDirectory, "000001_initial.up.sql"), "utf8"));
    database.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
      "000001_initial"
    );

    database
      .prepare(
        `
          INSERT INTO tasks (id, title, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `
      )
      .run(
        "task-1",
        "Legacy task",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );

    const insertSession = database.prepare(`
      INSERT INTO task_sessions (id, task_id, provider, created_at)
      VALUES (?, ?, ?, ?)
    `);
    insertSession.run(
      "session-1",
      "task-1",
      "codex",
      "2026-01-01T00:00:00.000Z"
    );
    insertSession.run(
      "session-2",
      "task-1",
      "codex",
      "2026-01-01T00:00:01.000Z"
    );
  } finally {
    database.close();
  }
}
