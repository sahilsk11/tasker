import type {
  D1Database,
  D1PreparedStatement,
  D1Result
} from "@cloudflare/workers-types";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import SqliteDatabase, {
  type Database as BetterSqliteDatabase
} from "better-sqlite3";
import cloudflareApp from "../cloudflare.js";

const D1_MAX_BOUND_PARAMETERS = 100;
const d1MigrationsDirectory = new URL("../../d1/migrations", import.meta.url).pathname;

type BoundStatement = {
  readonly params: readonly unknown[];
  readonly sql: string;
};

void test("Cloudflare Worker D1 path chunks within 100 params and preserves atomicity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-d1-session-messages-"));
  const databasePath = join(dir, "d1.sqlite");
  const sqlite = new SqliteDatabase(databasePath);
  sqlite.pragma("foreign_keys = ON");

  try {
    sqlite.exec(readFileSync(join(d1MigrationsDirectory, "0001_baseline.sql"), "utf8"));
    sqlite.exec(
      readFileSync(join(d1MigrationsDirectory, "0002_task_session_messages.sql"), "utf8")
    );

    const { d1, getBatchCount, getMaxParamsSeen } = createStrictD1Adapter(sqlite);
    const env = {
      ASSETS: {
        fetch: () => Promise.resolve(new Response("Not found", { status: 404 }))
      },
      DB: d1
    };

    const taskResponse = await cloudflareApp.fetch(
      new Request("https://tasker.example/api/tasks", {
        body: JSON.stringify({ title: "D1 messages task" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }),
      env
    );
    assert.equal(taskResponse.status, 201);
    const taskId = ((await taskResponse.json()) as {
      readonly task: { readonly id: string };
    }).task.id;

    const sessionResponse = await cloudflareApp.fetch(
      new Request(`https://tasker.example/api/tasks/${taskId}/sessions`, {
        body: JSON.stringify({ provider: "codex" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }),
      env
    );
    assert.equal(sessionResponse.status, 201);
    const sessionId = ((await sessionResponse.json()) as {
      readonly session: { readonly id: string };
    }).session.id;

    // Push 125 messages (> 100 D1 param limit for both lookup and insert chunks).
    const messages = Array.from({ length: 125 }, (_, index) => ({
      externalId: `d1-msg-${String(index)}`,
      ordinal: index,
      role: index % 2 === 0 ? "user" : "assistant",
      text: `D1 message ${String(index)}`
    }));

    const pushResponse = await cloudflareApp.fetch(
      new Request(`https://tasker.example/api/sessions/${sessionId}/messages`, {
        body: JSON.stringify({ messages }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }),
      env
    );
    assert.equal(pushResponse.status, 200);
    assert.deepEqual(await pushResponse.json(), {
      inserted: 125,
      skipped: 0,
      total: 125
    });
    assert.ok(getMaxParamsSeen() <= D1_MAX_BOUND_PARAMETERS);
    assert.ok(getBatchCount() >= 1);

    // Re-push same 125 messages -> idempotent, lookup chunked <= 100 params.
    const rePushResponse = await cloudflareApp.fetch(
      new Request(`https://tasker.example/api/sessions/${sessionId}/messages`, {
        body: JSON.stringify({ messages }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }),
      env
    );
    assert.equal(rePushResponse.status, 200);
    assert.deepEqual(await rePushResponse.json(), {
      inserted: 0,
      skipped: 125,
      total: 125
    });
    assert.ok(getMaxParamsSeen() <= D1_MAX_BOUND_PARAMETERS);

    // Conflict on an existing message -> 409 and nothing inserted.
    const conflictResponse = await cloudflareApp.fetch(
      new Request(`https://tasker.example/api/sessions/${sessionId}/messages`, {
        body: JSON.stringify({
          messages: [
            {
              externalId: "d1-msg-10",
              ordinal: 10,
              role: "user",
              text: "Altered text"
            },
            {
              externalId: "d1-msg-999",
              ordinal: 999,
              role: "assistant",
              text: "Must not insert"
            }
          ]
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }),
      env
    );
    assert.equal(conflictResponse.status, 409);
    const conflictPayload = (await conflictResponse.json()) as {
      readonly conflictingExternalIds: readonly string[];
      readonly error: string;
    };
    assert.deepEqual(conflictPayload.conflictingExternalIds, ["d1-msg-10"]);

    // Head reflects exact state.
    const headResponse = await cloudflareApp.fetch(
      new Request(`https://tasker.example/api/sessions/${sessionId}/messages/head`),
      env
    );
    assert.equal(headResponse.status, 200);
    assert.deepEqual(await headResponse.json(), {
      count: 125,
      lastExternalId: "d1-msg-124",
      lastOrdinal: 124
    });

    // Pagination on D1.
    const pageResponse = await cloudflareApp.fetch(
      new Request(
        `https://tasker.example/api/sessions/${sessionId}/messages?after=121&limit=2`
      ),
      env
    );
    assert.equal(pageResponse.status, 200);
    const page = (await pageResponse.json()) as {
      readonly messages: ReadonlyArray<{ readonly externalId: string }>;
      readonly nextAfter: number | null;
    };
    assert.deepEqual(
      page.messages.map((message) => message.externalId),
      ["d1-msg-122", "d1-msg-123"]
    );
    assert.equal(page.nextAfter, 123);

    // Unknown session -> 404.
    const unknownResponse = await cloudflareApp.fetch(
      new Request(`https://tasker.example/api/sessions/${randomUUID()}/messages/head`),
      env
    );
    assert.equal(unknownResponse.status, 404);
  } finally {
    sqlite.close();
    await rm(dir, { force: true, recursive: true });
  }
});

function createStrictD1Adapter(sqlite: BetterSqliteDatabase): {
  readonly d1: D1Database;
  readonly getBatchCount: () => number;
  readonly getMaxParamsSeen: () => number;
} {
  let maxParamsSeen = 0;
  let batchCount = 0;
  const statementMap = new WeakMap<D1PreparedStatement, BoundStatement>();

  function executeBound<T>(bound: BoundStatement): D1Result<T> {
    maxParamsSeen = Math.max(maxParamsSeen, bound.params.length);
    if (bound.params.length > D1_MAX_BOUND_PARAMETERS) {
      throw new Error(
        `D1_ERROR: too many SQL variables (${String(bound.params.length)} > ${String(D1_MAX_BOUND_PARAMETERS)})`
      );
    }

    const prepared = sqlite.prepare(bound.sql);
    const returnsRows = prepared.reader;
    if (returnsRows) {
      const rows = prepared.all(...bound.params) as T[];
      return {
        meta: {
          changed_db: false,
          changes: 0,
          duration: 0,
          last_row_id: 0,
          rows_read: rows.length,
          rows_written: 0,
          size_after: 0
        },
        results: rows,
        success: true
      };
    }

    const info = prepared.run(...bound.params);
    return {
      meta: {
        changed_db: info.changes > 0,
        changes: info.changes,
        duration: 0,
        last_row_id: Number(info.lastInsertRowid),
        rows_read: 0,
        rows_written: info.changes,
        size_after: 0
      },
      results: [],
      success: true
    };
  }

  function makePrepared(sql: string, params: readonly unknown[] = []): D1PreparedStatement {
    const bound: BoundStatement = { params, sql };
    const statement = {
      all<T = Record<string, unknown>>() {
        return Promise.resolve(executeBound<T>(bound));
      },
      bind(...values: unknown[]) {
        return makePrepared(sql, values);
      },
      first<T = unknown>() {
        const result = executeBound<T>(bound);
        return Promise.resolve(result.results[0] ?? null);
      },
      raw<T = unknown[]>() {
        return Promise.resolve(executeBound<T>(bound).results);
      },
      run<T = Record<string, unknown>>() {
        return Promise.resolve(executeBound<T>(bound));
      }
    } as unknown as D1PreparedStatement;

    statementMap.set(statement, bound);
    return statement;
  }

  const runBatchTransaction = sqlite.transaction((statements: readonly BoundStatement[]) =>
    statements.map((bound) => executeBound(bound))
  );

  const d1 = {
    batch<T = unknown>(statements: D1PreparedStatement[]) {
      batchCount += 1;
      const bounds = statements.map((statement) => {
        const bound = statementMap.get(statement);
        if (bound == null) {
          throw new Error("Unknown D1PreparedStatement passed to batch()");
        }
        return bound;
      });
      return Promise.resolve(runBatchTransaction(bounds) as Array<D1Result<T>>);
    },
    dump() {
      return Promise.reject(new Error("dump not implemented in test adapter"));
    },
    exec(query: string) {
      sqlite.exec(query);
      return Promise.resolve({ count: 1, duration: 0 });
    },
    prepare(sql: string) {
      return makePrepared(sql);
    },
    withSession() {
      throw new Error("withSession not implemented in test adapter");
    }
  } as unknown as D1Database;

  return {
    d1,
    getBatchCount: () => batchCount,
    getMaxParamsSeen: () => maxParamsSeen
  };
}
