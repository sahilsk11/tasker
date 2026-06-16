import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("task actions are loaded from the database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-actions-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Action catalog task"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (JSON.parse(taskResponse.body) as { readonly task: { readonly id: string } })
      .task;

    const actionsResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/actions`
    });
    assert.equal(actionsResponse.statusCode, 200);
    const actions = (JSON.parse(actionsResponse.body) as {
      readonly actions: ReadonlyArray<{
        readonly description: string;
        readonly id: string;
        readonly label: string;
        readonly options: { readonly worktree?: unknown } | null;
      }>;
    }).actions;

    assert.equal(actions.length, 6);
    assert.deepEqual(
      actions.map((action) => action.id),
      ["investigate", "plan", "breakdown", "implement", "code_review", "new_session"]
    );
    assert.equal(actions[0]?.label, "Investigate");
    assert.equal(actions[3]?.options?.worktree != null, true);
    assert.equal(actions[0]?.options, null);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("session create rejects unknown action ids", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-actions-invalid-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Invalid action task"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (JSON.parse(taskResponse.body) as { readonly task: { readonly id: string } })
      .task;

    const sessionResponse = await app.inject({
      method: "POST",
      payload: {
        actionId: "not-a-real-action",
        claimed: false,
        provider: "codex"
      },
      url: `/tasks/${task.id}/sessions`
    });

    assert.equal(sessionResponse.statusCode, 400);
    assert.match(JSON.parse(sessionResponse.body).error, /not-a-real-action/);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});
