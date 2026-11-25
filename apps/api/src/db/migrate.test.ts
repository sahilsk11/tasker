import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import SqliteDatabase, { type Database as BetterSqliteDatabase } from "better-sqlite3";
import { migrate } from "./migrate.js";
import { SqliteTaskMemorySearchRepository } from "../repository/sqlite-task-memory-search.repository.js";

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

      const tasks = database
        .prepare("SELECT id FROM tasks ORDER BY id")
        .all();

      assert.deepEqual(tasks, [
        {
          id: "task-1"
        }
      ]);

      const artifacts = database
        .prepare(
          `
            SELECT label, uri, created_by_session_id
            FROM task_artifacts
            ORDER BY uri, label
          `
        )
        .all();

      assert.deepEqual(artifacts, [
        {
          created_by_session_id: null,
          label: "plan",
          uri: "/tmp/legacy-plan.md"
        },
        {
          created_by_session_id: null,
          label: "other",
          uri: "/tmp/shared-resource"
        },
        {
          created_by_session_id: null,
          label: "other",
          uri: "/tmp/shared-resource"
        }
      ]);

      const pullRequests = database
        .prepare("SELECT url FROM task_pull_requests ORDER BY url")
        .all();

      assert.deepEqual(pullRequests, [
        {
          url: "https://github.com/sahilsk11/tasker/pull/1"
        }
      ]);

      const appliedVersions = database
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => (row as { version: string }).version);

      assert.deepEqual(appliedVersions, [
        "000001_initial",
        "000004_task_session_tracking_metadata",
        "000005_resource_attribution_and_dedupe",
        "000006_task_state_and_pull_requests",
        "000007_task_actions",
        "000008_task_action_icons",
        "000009_task_state_phase_names",
        "000010_scope_action_defaults",
        "000011_task_working_directory",
        "000012_task_dependencies",
        "000013_working_paths",
        "000014_action_recommendation_states",
        "000015_drop_task_actions",
        "000016_artifact_lifecycle",
        "000017_session_context",
        "000018_task_session_messages",
        "000019_task_sessions_provider_id_idx",
        "000020_task_memory_search"
      ]);

      const taskColumns = database
        .prepare("PRAGMA table_info(tasks)")
        .all()
        .map((row) => (row as { name: string }).name);
      assert.ok(!taskColumns.includes("state"));

      const artifactColumns = database
        .prepare("PRAGMA table_info(task_artifacts)")
        .all()
        .map((row) => (row as { name: string }).name);
      assert.ok(artifactColumns.includes("archived_at"));

      assert.equal(tableExists(database, "task_actions"), false);

      database.exec(
        readFileSync(
          join(migrationsDirectory, "000006_task_state_and_pull_requests.down.sql"),
          "utf8"
        )
      );

      const rolledBackArtifacts = database
        .prepare(
          `
            SELECT kind, label, uri
            FROM task_artifacts
            ORDER BY uri, kind
          `
        )
        .all();

      assert.deepEqual(rolledBackArtifacts, [
        {
          kind: "plan",
          label: "plan",
          uri: "/tmp/legacy-plan.md"
        },
        {
          kind: "legacy_artifact_artifact-5",
          label: "other",
          uri: "/tmp/shared-resource"
        },
        {
          kind: "other",
          label: "other",
          uri: "/tmp/shared-resource"
        },
        {
          kind: "pr",
          label: "Pull request",
          uri: "https://github.com/sahilsk11/tasker/pull/1"
        }
      ]);
    } finally {
      database.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("migrations rename legacy investigate session action to scope", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-migrate-scope-action-"));
  const databasePath = join(dir, "tasker.sqlite");

  try {
    const database = new SqliteDatabase(databasePath);
    try {
      database.exec(`
        CREATE TABLE schema_migrations (
          version text PRIMARY KEY,
          applied_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
      `);

      for (const version of [
        "000001_initial",
        "000004_task_session_tracking_metadata",
        "000005_resource_attribution_and_dedupe",
        "000006_task_state_and_pull_requests",
        "000007_task_actions",
        "000008_task_action_icons",
        "000009_task_state_phase_names"
      ]) {
        database.exec(readFileSync(join(migrationsDirectory, `${version}.up.sql`), "utf8"));
        database.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
          version
        );
      }

      database
        .prepare(
          `
            INSERT INTO tasks (id, title, state, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `
        )
        .run(
          "task-1",
          "Legacy action task",
          "ready",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z"
        );
      database
        .prepare(
          `
            INSERT INTO task_actions (
              id,
              label,
              icon_name,
              description,
              prompt_template,
              enabled,
              sort_order,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          "investigate",
          "Investigate",
          "search",
          "Inspect the task and produce a concise recommendation.",
          "{{taskHeader}}",
          1,
          0,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z"
        );
      database
        .prepare(
          `
            INSERT INTO task_sessions (id, task_id, provider, action_id, created_at)
            VALUES (?, ?, ?, ?, ?)
          `
        )
        .run(
          "session-1",
          "task-1",
          "codex",
          "investigate",
          "2026-01-01T00:00:00.000Z"
        );
    } finally {
      database.close();
    }

    migrate({ databasePath, migrationsDirectory });

    const migrated = new SqliteDatabase(databasePath);
    try {
      assert.deepEqual(migrated.prepare("SELECT action_id FROM task_sessions").all(), [
        {
          action_id: "scope"
        }
      ]);
      assert.equal(tableExists(migrated, "task_actions"), false);
    } finally {
      migrated.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("migrations drop legacy task action table", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-migrate-drop-actions-"));
  const databasePath = join(dir, "tasker.sqlite");

  try {
    const database = new SqliteDatabase(databasePath);
    try {
      database.exec(`
        CREATE TABLE schema_migrations (
          version text PRIMARY KEY,
          applied_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE task_actions (
          id text PRIMARY KEY,
          label text NOT NULL,
          description text NOT NULL,
          prompt_template text NOT NULL,
          options_json text,
          enabled integer NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          sort_order integer NOT NULL DEFAULT 0,
          created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          icon_name text,
          recommendation_states_json text
        );

        CREATE TABLE tasks (
          id text PRIMARY KEY,
          title text NOT NULL,
          description text,
          state text NOT NULL DEFAULT 'ready',
          parent_task_id text,
          working_directory text,
          created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE task_sessions (
          id text PRIMARY KEY,
          task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          provider text NOT NULL DEFAULT 'codex',
          provider_id text,
          metadata_json text
        );
        INSERT INTO tasks (id, title, state) VALUES ('legacy-task', 'Legacy task', 'planning');
        INSERT INTO task_sessions (id, task_id, metadata_json)
          VALUES ('legacy-session', 'legacy-task', '{"url":"https://example.com/session"}');

        CREATE TABLE task_artifacts (
          id text PRIMARY KEY,
          task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          label text NOT NULL CHECK (label IN ('research', 'plan', 'implement', 'other')),
          uri text NOT NULL,
          dedupe_key text NOT NULL,
          created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by_session_id text
        );
      `);
      for (const version of [
        "000001_initial",
        "000004_task_session_tracking_metadata",
        "000005_resource_attribution_and_dedupe",
        "000006_task_state_and_pull_requests",
        "000007_task_actions",
        "000008_task_action_icons",
        "000009_task_state_phase_names",
        "000010_scope_action_defaults",
        "000011_task_working_directory",
        "000012_task_dependencies",
        "000013_working_paths",
        "000014_action_recommendation_states"
      ]) {
        database.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
          version
        );
      }
    } finally {
      database.close();
    }

    migrate({ databasePath, migrationsDirectory });

    const migrated = new SqliteDatabase(databasePath);
    try {
      assert.equal(tableExists(migrated, "task_actions"), false);
      assert.deepEqual(
        migrated.prepare("SELECT id, task_id, source_url FROM task_sessions").all(),
        [{ id: "legacy-session", task_id: "legacy-task", source_url: "https://example.com/session" }]
      );
    } finally {
      migrated.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task dependency migration persists task edges", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-migrate-task-deps-"));
  const databasePath = join(dir, "tasker.sqlite");

  try {
    migrate({ databasePath, migrationsDirectory });

    const database = new SqliteDatabase(databasePath);
    database.pragma("foreign_keys = ON");

    try {
      const insertTask = database.prepare(`
        INSERT INTO tasks (id, title, parent_task_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertTask.run(
        "parent-1",
        "Parent 1",
        null,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      );
      insertTask.run(
        "parent-2",
        "Parent 2",
        null,
        "2026-01-01T00:00:01.000Z",
        "2026-01-01T00:00:01.000Z"
      );
      insertTask.run(
        "child-1",
        "Child 1",
        "parent-1",
        "2026-01-01T00:00:02.000Z",
        "2026-01-01T00:00:02.000Z"
      );
      insertTask.run(
        "child-2",
        "Child 2",
        "parent-1",
        "2026-01-01T00:00:03.000Z",
        "2026-01-01T00:00:03.000Z"
      );
      insertTask.run(
        "other-child",
        "Other child",
        "parent-2",
        "2026-01-01T00:00:04.000Z",
        "2026-01-01T00:00:04.000Z"
      );

      const insertDependency = database.prepare(`
        INSERT INTO task_dependencies (
          task_id,
          depends_on_task_id
        )
        VALUES (?, ?)
      `);

      insertDependency.run("child-2", "child-1");
      insertDependency.run("child-2", "other-child");

      assert.throws(() => {
        insertDependency.run("child-1", "child-1");
      }, /CHECK constraint failed/u);
      assert.throws(() => {
        insertDependency.run("child-1", "missing-task");
      }, /FOREIGN KEY constraint failed/u);

      assert.deepEqual(
        database
          .prepare(
            `
              SELECT task_id, depends_on_task_id
              FROM task_dependencies
              ORDER BY task_id, depends_on_task_id
            `
          )
          .all(),
        [
          {
            depends_on_task_id: "child-1",
            task_id: "child-2"
          },
          {
            depends_on_task_id: "other-child",
            task_id: "child-2"
          }
        ]
      );

      database.prepare("DELETE FROM tasks WHERE id = ?").run("other-child");

      assert.deepEqual(
        database
          .prepare(
            `
              SELECT task_id, depends_on_task_id
              FROM task_dependencies
            `
          )
          .all(),
        [
          {
            depends_on_task_id: "child-1",
            task_id: "child-2"
          }
        ]
      );
    } finally {
      database.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task session messages migration enforces constraints, cascade delete, rollback, and D1 parity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-migrate-session-messages-"));
  const databasePath = join(dir, "tasker.sqlite");
  const d1DatabasePath = join(dir, "d1.sqlite");
  const d1MigrationsDirectory = new URL("../../d1/migrations", import.meta.url).pathname;

  try {
    migrate({ databasePath, migrationsDirectory });

    const database = new SqliteDatabase(databasePath);
    database.pragma("foreign_keys = ON");
    try {
      database
        .prepare(
          `
            INSERT INTO tasks (id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?)
          `
        )
        .run(
          "task-1",
          "Message task",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z"
        );
      database
        .prepare(
          `
            INSERT INTO task_sessions (id, task_id, provider, created_at)
            VALUES (?, ?, ?, ?)
          `
        )
        .run("session-1", "task-1", "codex", "2026-01-01T00:00:00.000Z");

      const insertMessage = database.prepare(`
        INSERT INTO task_session_messages (
          id,
          session_id,
          external_id,
          ordinal,
          role,
          text,
          content_hash,
          occurred_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertMessage.run(
        "row-1",
        "session-1",
        "ext-1",
        0,
        "user",
        "Hello",
        "hash-1",
        "2026-01-01T00:00:01.000Z"
      );

      assert.throws(() => {
        insertMessage.run(
          "row-dup",
          "session-1",
          "ext-1",
          1,
          "assistant",
          "Duplicate external_id",
          "hash-2",
          null
        );
      }, /UNIQUE constraint failed/u);

      assert.throws(() => {
        insertMessage.run(
          "row-bad-role",
          "session-1",
          "ext-2",
          1,
          "system",
          "Bad role",
          "hash-2",
          null
        );
      }, /CHECK constraint failed/u);

      assert.throws(() => {
        insertMessage.run(
          "row-missing-session",
          "missing-session",
          "ext-2",
          1,
          "assistant",
          "Missing session",
          "hash-2",
          null
        );
      }, /FOREIGN KEY constraint failed/u);

      database.prepare("DELETE FROM task_sessions WHERE id = ?").run("session-1");
      assert.deepEqual(
        database.prepare("SELECT id FROM task_session_messages").all(),
        []
      );

      database.exec(
        readFileSync(
          join(migrationsDirectory, "000018_task_session_messages.down.sql"),
          "utf8"
        )
      );
      assert.equal(tableExists(database, "task_session_messages"), false);

      const sessionIndexesBeforeRollback = database
        .prepare("PRAGMA index_list(task_sessions)")
        .all()
        .map((row) => (row as { name: string }).name);
      assert.ok(
        sessionIndexesBeforeRollback.includes("task_sessions_provider_provider_id_idx")
      );
      database.exec(
        readFileSync(
          join(migrationsDirectory, "000019_task_sessions_provider_id_idx.down.sql"),
          "utf8"
        )
      );
      const sessionIndexesAfterRollback = database
        .prepare("PRAGMA index_list(task_sessions)")
        .all()
        .map((row) => (row as { name: string }).name);
      assert.ok(
        !sessionIndexesAfterRollback.includes("task_sessions_provider_provider_id_idx")
      );
    } finally {
      database.close();
    }

    const d1Database = new SqliteDatabase(d1DatabasePath);
    d1Database.pragma("foreign_keys = ON");
    try {
      d1Database.exec(
        readFileSync(join(d1MigrationsDirectory, "0001_baseline.sql"), "utf8")
      );
      d1Database.exec(
        readFileSync(join(d1MigrationsDirectory, "0002_session_context.sql"), "utf8")
      );
      d1Database.exec(
        readFileSync(join(d1MigrationsDirectory, "0003_task_session_messages.sql"), "utf8")
      );
      d1Database.exec(
        readFileSync(
          join(d1MigrationsDirectory, "0004_task_sessions_provider_id_idx.sql"),
          "utf8"
        )
      );

      assert.equal(tableExists(d1Database, "task_session_messages"), true);
      const indexes = d1Database
        .prepare("PRAGMA index_list(task_session_messages)")
        .all()
        .map((row) => (row as { name: string }).name);
      assert.ok(indexes.includes("task_session_messages_session_ordinal_idx"));
      const d1SessionIndexes = d1Database
        .prepare("PRAGMA index_list(task_sessions)")
        .all()
        .map((row) => (row as { name: string }).name);
      assert.ok(d1SessionIndexes.includes("task_sessions_provider_provider_id_idx"));
    } finally {
      d1Database.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("SQLite memory search persists and retrieves sqlite-vec embeddings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-migrate-memory-search-"));
  const databasePath = join(dir, "tasker.sqlite");

  try {
    migrate({ databasePath, migrationsDirectory });
    const database = new SqliteDatabase(databasePath);
    database.pragma("foreign_keys = ON");
    database
      .prepare("INSERT INTO tasks (id, title) VALUES (?, ?)")
      .run("task-1", "Latency troubleshooting");
    database.close();

    const repository = new SqliteTaskMemorySearchRepository(databasePath);
    try {
      const embedding = new Float32Array(384);
      embedding[0] = 1;
      repository.persistDocuments(
        [{
          body: "",
          chunkIndex: 0,
          embeddingText: "Latency troubleshooting",
          messageId: null,
          messageOrdinal: null,
          messageRole: null,
          sessionId: null,
          sourceType: "task_title",
          taskId: "task-1",
          title: "Latency troubleshooting",
          vectorId: "task:task-1"
        }],
        [embedding]
      );

      const lexical = repository.lexicalSearch('"latency"', 5);
      const semantic = repository.vectorSearch(embedding, 5);
      assert.equal(lexical[0]?.taskId, "task-1");
      assert.equal(semantic[0]?.taskId, "task-1");
      assert.equal(semantic[0].semanticSimilarity, 1);
      assert.equal(semantic[0].sessionSourceUrl, null);
    } finally {
      repository.close();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

function tableExists(database: BetterSqliteDatabase, tableName: string): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return row != null;
}

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

    const insertArtifact = database.prepare(`
      INSERT INTO task_artifacts (id, task_id, kind, label, uri, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertArtifact.run(
      "artifact-1",
      "task-1",
      "summary",
      "Plan",
      "/tmp/legacy-plan.md",
      "2026-01-01T00:00:02.000Z"
    );
    insertArtifact.run(
      "artifact-2",
      "task-1",
      "pr",
      "Implementation PR",
      "https://github.com/sahilsk11/tasker/pull/1",
      "2026-01-01T00:00:03.000Z"
    );
    insertArtifact.run(
      "artifact-3",
      "task-1",
      "pr",
      "Duplicate PR",
      "https://github.com/sahilsk11/tasker/pull/1",
      "2026-01-01T00:00:04.000Z"
    );
    insertArtifact.run(
      "artifact-4",
      "task-1",
      "summary",
      "Summary",
      "/tmp/shared-resource",
      "2026-01-01T00:00:05.000Z"
    );
    insertArtifact.run(
      "artifact-5",
      "task-1",
      "report",
      "Report",
      "/tmp/shared-resource",
      "2026-01-01T00:00:06.000Z"
    );
  } finally {
    database.close();
  }
}
