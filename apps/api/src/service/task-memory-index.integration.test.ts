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
    const originalMessageGenerations = messageVectorGenerations(databasePath);
    assert.ok(originalStatus.indexedDocuments > 32);
    assert.ok(originalMessageGenerations.length > 32);
    assert.equal(
      new Set(originalMessageGenerations).size,
      1,
      "all chunks for one source revision should share a generation"
    );
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
    const updatedMessageGenerations = messageVectorGenerations(databasePath);
    assert.equal(new Set(updatedMessageGenerations).size, 1);
    assert.notEqual(
      updatedMessageGenerations[0],
      originalMessageGenerations[0],
      "a source update should get a new generation"
    );
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

void test("an expired message index lease cannot replace a newer write or resurrect a delete", async () => {
  const { databasePath, directory } = await createSearchDatabase(
    "Original message text"
  );
  let oldRepository: SqliteTaskMemorySearchRepository | undefined;
  let currentRepository: SqliteTaskMemorySearchRepository | undefined;

  try {
    oldRepository = new SqliteTaskMemorySearchRepository(databasePath);
    currentRepository = new SqliteTaskMemorySearchRepository(databasePath);
    await drainIndex(
      new TaskMemorySearchService(oldRepository, testEmbeddings()),
      oldRepository
    );

    const updateGate = blockedEmbeddings("staleraceoldmarker");
    const staleUpdate = new TaskMemorySearchService(oldRepository, updateGate.provider);
    const currentSearch = new TaskMemorySearchService(
      currentRepository,
      testEmbeddings()
    );
    updateMessage(databasePath, "staleraceoldmarker");
    const oldUpdate = staleUpdate.processPendingJobs(1);
    await updateGate.started;
    updateMessage(databasePath, "freshracecurrentmarker");
    await currentSearch.processPendingJobs(1);
    updateGate.release();
    await oldUpdate;

    assert.equal(currentRepository.getIndexStatus().pendingJobs, 0);
    assert.equal(
      currentRepository.lexicalSearch(toFtsExpression("freshracecurrentmarker"), 10)
        .find((candidate) => candidate.messageId === "message-search")?.body,
      "freshracecurrentmarker"
    );
    assert.deepEqual(
      currentRepository.lexicalSearch(toFtsExpression("staleraceoldmarker"), 10)
        .filter((candidate) => candidate.messageId === "message-search"),
      []
    );
    assert.equal(
      currentRepository.vectorSearch(vectorFor("freshracecurrentmarker"), 10)
        .find((candidate) => candidate.messageId === "message-search")?.body,
      "freshracecurrentmarker"
    );
    assert.deepEqual(
      currentRepository
        .vectorSearch(
          vectorFor(
            "Task: Existing Task\nSession: Existing Session\nfreshracecurrentmarker"
          ),
          10
        )
        .filter((candidate) => candidate.messageId === "message-search")
        .map((candidate) => candidate.body),
      ["freshracecurrentmarker"],
      "semantic search should expose only the current message generation"
    );

    const deleteGate = blockedEmbeddings("staleracedeletemarker");
    const staleDelete = new TaskMemorySearchService(oldRepository, deleteGate.provider);
    updateMessage(databasePath, "staleracedeletemarker");
    const oldDelete = staleDelete.processPendingJobs(1);
    await deleteGate.started;
    deleteMessage(databasePath);
    await currentSearch.processPendingJobs(1);
    deleteGate.release();
    await oldDelete;

    assert.equal(currentRepository.getIndexStatus().pendingJobs, 0);
    assert.deepEqual(
      currentRepository.lexicalSearch(toFtsExpression("staleracedeletemarker"), 10)
        .filter((candidate) => candidate.messageId === "message-search"),
      []
    );
    assert.equal(currentRepository.getIndexStatus().indexedDocuments, 2);
  } finally {
    oldRepository?.close();
    currentRepository?.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("SQLite index writes require the active generation token", async () => {
  const { databasePath, directory } = await createSearchDatabase("Generation check");
  let repository: SqliteTaskMemorySearchRepository | undefined;

  try {
    repository = new SqliteTaskMemorySearchRepository(databasePath);
    const [job] = repository.claimJobs(1);
    assert.ok(job);
    const mismatchedGenerationJob = {
      ...job,
      generationToken: `${job.generationToken}-stale`
    };

    assert.equal(repository.deleteSource(mismatchedGenerationJob), false);
    assert.equal(repository.persistDocuments(mismatchedGenerationJob, [], []), false);
    assert.equal(repository.getIndexStatus().indexedDocuments, 0);
  } finally {
    repository?.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("task title changes reindex dependent session and message context", async () => {
  const { databasePath, directory } = await createSearchDatabase(
    "Task title context marker"
  );
  let repository: SqliteTaskMemorySearchRepository | undefined;

  try {
    repository = new SqliteTaskMemorySearchRepository(databasePath);
    const indexedTexts: string[] = [];
    const search = new TaskMemorySearchService(
      repository,
      recordingEmbeddings(indexedTexts)
    );
    await drainIndex(search, repository);
    indexedTexts.length = 0;

    updateTaskTitle(databasePath, "Updated Task Context");
    await drainIndex(search, repository);

    assert.ok(
      indexedTexts.some((text) =>
        text.includes("Task: Updated Task Context\nSession: Existing Session")
      ),
      "session-title embedding should use the new task title"
    );
    assert.ok(
      indexedTexts.some((text) =>
        text.includes(
          "Task: Updated Task Context\nSession: Existing Session\nTask title context marker"
        )
      ),
      "message embedding should use the new task title"
    );
  } finally {
    repository?.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("session title changes reindex dependent message context", async () => {
  const { databasePath, directory } = await createSearchDatabase(
    "Session title context marker"
  );
  let repository: SqliteTaskMemorySearchRepository | undefined;

  try {
    repository = new SqliteTaskMemorySearchRepository(databasePath);
    const indexedTexts: string[] = [];
    const search = new TaskMemorySearchService(
      repository,
      recordingEmbeddings(indexedTexts)
    );
    await drainIndex(search, repository);
    indexedTexts.length = 0;

    updateSessionTitle(databasePath, "Updated Session Context");
    await drainIndex(search, repository);

    assert.ok(
      indexedTexts.some((text) =>
        text.includes(
          "Task: Existing Task\nSession: Updated Session Context\nSession title context marker"
        )
      ),
      "message embedding should use the new session title"
    );
  } finally {
    repository?.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("overlapping title changes index the final source context", async () => {
  const { databasePath, directory } = await createSearchDatabase(
    "Final context after repeated updates"
  );
  let repository: SqliteTaskMemorySearchRepository | undefined;

  try {
    repository = new SqliteTaskMemorySearchRepository(databasePath);
    const indexedTexts: string[] = [];
    const search = new TaskMemorySearchService(
      repository,
      recordingEmbeddings(indexedTexts)
    );
    await drainIndex(search, repository);
    indexedTexts.length = 0;

    updateTaskTitle(databasePath, "Transient Task Context");
    updateTaskTitle(databasePath, "Final Task Context");
    updateSessionTitle(databasePath, "Transient Session Context");
    updateSessionTitle(databasePath, "Final Session Context");
    await drainIndex(search, repository);

    assert.equal(
      indexedTexts.some((text) =>
        text.includes("Transient Task Context") ||
        text.includes("Transient Session Context")
      ),
      false
    );
    assert.ok(
      indexedTexts.some((text) =>
        text.includes(
          "Task: Final Task Context\nSession: Final Session Context\n" +
          "Final context after repeated updates"
        )
      )
    );
  } finally {
    repository?.close();
    await rm(directory, { force: true, recursive: true });
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

async function createSearchDatabase(initialMessage: string): Promise<{
  readonly databasePath: string;
  readonly directory: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "tasker-memory-race-"));
  const databasePath = join(directory, "tasker.sqlite");
  migrate({ databasePath, migrationsDirectory });
  const database = new SqliteDatabase(databasePath);
  try {
    database.pragma("foreign_keys = ON");
    database
      .prepare("INSERT INTO tasks (id, title) VALUES (?, ?)")
      .run("task-search", "Existing Task");
    database
      .prepare(
        "INSERT INTO task_sessions (id, task_id, provider, display_title) VALUES (?, ?, ?, ?)"
      )
      .run("session-search", "task-search", "codex", "Existing Session");
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
        initialMessage,
        "initial"
      );
  } finally {
    database.close();
  }
  return { databasePath, directory };
}

function updateMessage(databasePath: string, text: string): void {
  const database = new SqliteDatabase(databasePath);
  try {
    database
      .prepare("UPDATE task_session_messages SET text = ?, content_hash = ? WHERE id = ?")
      .run(text, text, "message-search");
  } finally {
    database.close();
  }
}

function messageVectorGenerations(databasePath: string): string[] {
  const database = new SqliteDatabase(databasePath, { readonly: true });
  try {
    const rows = database
      .prepare(
        "SELECT vector_id FROM task_memory_search_documents WHERE message_id = ?"
      )
      .all("message-search") as ReadonlyArray<{ vector_id: string }>;
    return rows.map((row) => row.vector_id.split(":").at(-1) ?? "");
  } finally {
    database.close();
  }
}

function deleteMessage(databasePath: string): void {
  const database = new SqliteDatabase(databasePath);
  try {
    database
      .prepare("DELETE FROM task_session_messages WHERE id = ?")
      .run("message-search");
  } finally {
    database.close();
  }
}

function updateTaskTitle(databasePath: string, title: string): void {
  const database = new SqliteDatabase(databasePath);
  try {
    database.prepare("UPDATE tasks SET title = ? WHERE id = ?").run(
      title,
      "task-search"
    );
  } finally {
    database.close();
  }
}

function updateSessionTitle(databasePath: string, title: string): void {
  const database = new SqliteDatabase(databasePath);
  try {
    database.prepare("UPDATE task_sessions SET display_title = ? WHERE id = ?").run(
      title,
      "session-search"
    );
  } finally {
    database.close();
  }
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

function recordingEmbeddings(texts: string[]): TaskMemoryEmbeddingProvider {
  return {
    model: "test-model",
    embed: (batch) => {
      texts.push(...batch);
      return Promise.resolve(batch.map(vectorFor));
    }
  };
}

function vectorFor(text: string): Float32Array {
  const vector = new Float32Array(384);
  for (const token of text.toLowerCase().match(/[a-z0-9]+/gu) ?? []) {
    let hash = 2_166_136_261;
    for (const character of token) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
    }
    const index = (hash >>> 0) % vector.length;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  const magnitude = Math.hypot(...vector);
  if (magnitude > 0) {
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] = (vector[index] ?? 0) / magnitude;
    }
  }
  return vector;
}

function blockedEmbeddings(marker: string): {
  readonly provider: TaskMemoryEmbeddingProvider;
  readonly release: () => void;
  readonly started: Promise<void>;
} {
  let signalStarted!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let hasBlocked = false;

  return {
    provider: {
      model: "test-model",
      embed: async (texts) => {
        if (!hasBlocked && texts.some((text) => text.includes(marker))) {
          hasBlocked = true;
          signalStarted();
          await blocked;
        }
        return texts.map(vectorFor);
      }
    },
    release,
    started
  };
}
