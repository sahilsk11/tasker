import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import SqliteDatabase from "better-sqlite3";
import { migrate } from "../db/migrate.js";
import { SqliteTaskMemorySearchRepository } from "../repository/sqlite-task-memory-search.repository.js";
import type { TaskMemoryEmbeddingProvider } from "../domain/task-memory-search.js";
import { TaskMemorySearchService, toFtsExpression } from "./task-memory-search.js";

const migrationsDirectory = new URL("../../migrations", import.meta.url).pathname;

void test("durable indexing replaces stale chunks and removes deleted messages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-memory-index-integration-"));
  const databasePath = join(dir, "tasker.sqlite");
  const oldMarker = "retiredlastmarker";
  let repository: SqliteTaskMemorySearchRepository | undefined;
  try {
    migrate({ databasePath, migrationsDirectory });
    const database = new SqliteDatabase(databasePath);
    try {
      database.pragma("foreign_keys = ON");
      database
        .prepare("INSERT INTO tasks (id, title) VALUES (?, ?)")
        .run("task-search", "Index recovery task");
      database
        .prepare(
          "INSERT INTO task_sessions (id, task_id, provider, display_title) VALUES (?, ?, ?, ?)"
        )
        .run("session-search", "task-search", "codex", "Index recovery conversation");

      const oldText = Array.from(
        { length: 48 },
        (_, index) =>
          `${String(index)} ${"retired passage from the old message. ".repeat(9)}`
      ).join("\n") + oldMarker;
      database
        .prepare(
          `
            INSERT INTO task_session_messages (
              id, session_id, external_id, ordinal, role, text, content_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          "message-search",
          "session-search",
          "external-search",
          0,
          "user",
          oldText,
          "v1"
        );
    } finally {
      database.close();
    }

    repository = new SqliteTaskMemorySearchRepository(databasePath);
    let search = new TaskMemorySearchService(repository, testEmbeddings());
    await drainIndex(search, repository);

    const originalStatus = repository.getIndexStatus();
    assert.ok(originalStatus.indexedDocuments > 32);
    assert.equal(
      repository.lexicalSearch(toFtsExpression(oldMarker), 10)[0]?.messageId,
      "message-search"
    );

    repository.close();
    repository = new SqliteTaskMemorySearchRepository(databasePath);
    search = new TaskMemorySearchService(repository, testEmbeddings());
    assert.equal(repository.getIndexStatus().indexedDocuments, originalStatus.indexedDocuments);
    assert.equal(
      repository.lexicalSearch(toFtsExpression(oldMarker), 10)[0]?.messageId,
      "message-search"
    );

    const updateDatabase = new SqliteDatabase(databasePath);
    updateDatabase.pragma("foreign_keys = ON");
    updateDatabase
      .prepare("UPDATE task_session_messages SET text = ?, content_hash = ? WHERE id = ?")
      .run("Current passage activefreshmarker", "v2", "message-search");
    updateDatabase.close();

    await drainIndex(search, repository);
    assert.equal(repository.getIndexStatus().indexedDocuments, 3);
    assert.deepEqual(repository.lexicalSearch(toFtsExpression(oldMarker), 10), []);
    assert.equal(
      repository.lexicalSearch(toFtsExpression("activefreshmarker"), 10)[0]?.messageId,
      "message-search"
    );

    const deleteDatabase = new SqliteDatabase(databasePath);
    deleteDatabase.pragma("foreign_keys = ON");
    deleteDatabase
      .prepare("DELETE FROM task_session_messages WHERE id = ?")
      .run("message-search");
    deleteDatabase.close();

    await drainIndex(search, repository);
    assert.equal(repository.getIndexStatus().indexedDocuments, 2);
    assert.deepEqual(
      repository.lexicalSearch(toFtsExpression("activefreshmarker"), 10),
      []
    );
  } finally {
    repository?.close();
    await rm(dir, { force: true, recursive: true });
  }
});

async function drainIndex(
  search: TaskMemorySearchService,
  repository: SqliteTaskMemorySearchRepository
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (repository.getIndexStatus().pendingJobs === 0) {
      return;
    }
    await search.processPendingJobs(1);
  }
  assert.fail("Search index jobs did not drain");
}

function testEmbeddings(): TaskMemoryEmbeddingProvider {
  return {
    model: "test-model",
    embed: (texts) => {
      const vector = new Float32Array(384);
      vector[0] = 1;
      return Promise.resolve(texts.map(() => vector));
    }
  };
}
