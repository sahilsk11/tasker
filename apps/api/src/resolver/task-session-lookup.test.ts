import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";
import { getDefaultTaskActionsPath } from "../task-actions/catalog.js";

type SessionResponseRow = {
  readonly actionId: string | null;
  readonly appName: string | null;
  readonly claimedAt: string | null;
  readonly clientName: string | null;
  readonly createdAt: string;
  readonly displayTitle: string | null;
  readonly id: string;
  readonly machineName: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly provider: string;
  readonly providerId: string | null;
  readonly sourceUrl: string | null;
  readonly taskId: string;
  readonly transcriptPath: string | null;
};

void test("GET /sessions resolves 0, 1, and 2 sessions across tasks and matches task session shape", async () => {
  const { app, cleanup } = await createLookupTestContext("tasker-session-lookup-");

  try {
    const taskOneId = await createTask(app, "Task one");
    const taskTwoId = await createTask(app, "Task two");

    // 0 matches before any sessions exist.
    const emptyResponse = await app.inject({
      method: "GET",
      url: "/sessions?provider=t3&providerId=thread-missing"
    });
    assert.equal(emptyResponse.statusCode, 200);
    assert.deepEqual(readJson(emptyResponse.body), { sessions: [] });

    const sessionA = await createSession(app, taskOneId, {
      clientName: "T3",
      displayTitle: "First thread",
      machineName: "Strucker",
      provider: "t3",
      providerId: "thread-alpha"
    });
    await createSession(app, taskOneId, {
      provider: "codex",
      providerId: "thread-alpha"
    });
    const sessionB1 = await createSession(app, taskOneId, {
      provider: "t3",
      providerId: "thread-shared"
    });
    const sessionB2 = await createSession(app, taskTwoId, {
      provider: "t3",
      providerId: "thread-shared"
    });
    // Unclaimed sessions should not be returned, matching GET /tasks/:id/sessions.
    await createSession(app, taskTwoId, {
      claimed: false,
      provider: "t3",
      providerId: "thread-alpha"
    });

    // 1 match: matches exact row shape from GET /tasks/:id/sessions.
    const singleResponse = await app.inject({
      method: "GET",
      url: "/sessions?provider=t3&providerId=thread-alpha"
    });
    assert.equal(singleResponse.statusCode, 200);
    const singleBody = readJson(singleResponse.body) as {
      readonly sessions: readonly SessionResponseRow[];
    };
    assert.equal(singleBody.sessions.length, 1);

    const taskSessionsResponse = await app.inject({
      method: "GET",
      url: `/tasks/${taskOneId}/sessions`
    });
    assert.equal(taskSessionsResponse.statusCode, 200);
    const taskSessions = (
      readJson(taskSessionsResponse.body) as {
        readonly sessions: readonly SessionResponseRow[];
      }
    ).sessions;
    const expectedSessionA = taskSessions.find((row) => row.id === sessionA.id);
    assert.ok(expectedSessionA);
    const [matchedSessionA] = singleBody.sessions;
    assert.ok(matchedSessionA);
    assert.deepEqual(matchedSessionA, expectedSessionA);
    assert.equal(matchedSessionA.id, sessionA.id);
    assert.equal(matchedSessionA.taskId, taskOneId);

    // 2 matches across two different tasks.
    const multiResponse = await app.inject({
      method: "GET",
      url: "/sessions?provider=t3&providerId=thread-shared"
    });
    assert.equal(multiResponse.statusCode, 200);
    const multiBody = readJson(multiResponse.body) as {
      readonly sessions: readonly SessionResponseRow[];
    };
    assert.deepEqual(
      multiBody.sessions.map((row) => ({ id: row.id, taskId: row.taskId })),
      [
        { id: sessionB1.id, taskId: taskOneId },
        { id: sessionB2.id, taskId: taskTwoId }
      ]
    );

    // Unknown providerId still returns 200 with empty list.
    const unknownResponse = await app.inject({
      method: "GET",
      url: "/sessions?provider=t3&providerId=thread-unknown"
    });
    assert.equal(unknownResponse.statusCode, 200);
    assert.deepEqual(readJson(unknownResponse.body), { sessions: [] });
  } finally {
    await cleanup();
  }
});

void test("GET /sessions returns 400 when provider or providerId is missing or empty", async () => {
  const { app, cleanup } = await createLookupTestContext("tasker-session-lookup-400-");

  try {
    for (const invalidUrl of [
      "/sessions",
      "/sessions?provider=t3",
      "/sessions?providerId=thread-1",
      "/sessions?provider=&providerId=thread-1",
      "/sessions?provider=t3&providerId=",
      "/sessions?provider=%20%20&providerId=thread-1",
      "/sessions?provider=t3&providerId=%20%20"
    ]) {
      const response = await app.inject({
        method: "GET",
        url: invalidUrl
      });
      assert.equal(response.statusCode, 400, `Expected 400 for ${invalidUrl}`);
    }
  } finally {
    await cleanup();
  }
});

async function createLookupTestContext(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = join(dir, "task-actions.json");
  await copyFile(getDefaultTaskActionsPath(), taskActionsPath);

  const app = await createApp({
    databasePath,
    taskActionsPath
  });

  return {
    app,
    cleanup: async () => {
      await app.close();
      await rm(dir, { force: true, recursive: true });
    }
  };
}

async function createTask(
  app: Awaited<ReturnType<typeof createApp>>,
  title: string
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    payload: { title },
    url: "/tasks"
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as { readonly task: { readonly id: string } }).task.id;
}

async function createSession(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string,
  payload: Record<string, unknown>
): Promise<SessionResponseRow> {
  const response = await app.inject({
    method: "POST",
    payload,
    url: `/tasks/${taskId}/sessions`
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as { readonly session: SessionResponseRow }).session;
}

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}
