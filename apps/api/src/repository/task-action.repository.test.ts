import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import SqliteDatabase from "better-sqlite3";
import { createApp } from "../app.js";
import type { TaskState } from "../domain/task.js";
import { seedTaskActionDefaults } from "../test/seed-task-action-defaults.js";

void test("task actions are loaded from the database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-actions-"));
  const databasePath = join(dir, "tasker.sqlite");
  const app = await createApp({
    databasePath,
    linearApiKey: null
  });
  await seedTaskActionDefaults(databasePath);

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
        readonly isRecommended: boolean;
        readonly label: string;
        readonly options: { readonly worktree?: unknown } | null;
      }>;
    }).actions;

    assert.equal(actions.length, 5);
    assert.deepEqual(
      actions.map((action) => action.id),
      ["research", "plan", "implement", "breakdown", "code_review"]
    );
    const firstAction = actions[0];
    const implementAction = actions[2];
    assert.ok(firstAction);
    assert.ok(implementAction);
    assert.equal(firstAction.label, "Research");
    assert.equal(firstAction.isRecommended, true);
    assert.equal(implementAction.options?.worktree != null, true);
    assert.equal(firstAction.options, null);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task action recommendations are derived from task state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-action-recommendations-"));
  const databasePath = join(dir, "tasker.sqlite");
  const app = await createApp({
    databasePath,
    linearApiKey: null
  });
  await seedTaskActionDefaults(databasePath);

  try {
    const expectations: ReadonlyArray<{
      readonly recommendedIds: readonly string[];
      readonly state: TaskState;
    }> = [
      { recommendedIds: ["research", "breakdown"], state: "ready" },
      { recommendedIds: ["plan", "breakdown"], state: "research" },
      { recommendedIds: ["implement", "breakdown"], state: "plan" },
      { recommendedIds: ["code_review"], state: "implement" },
      { recommendedIds: [], state: "code_review" },
      { recommendedIds: [], state: "merged" },
      { recommendedIds: [], state: "done" }
    ];

    for (const { recommendedIds, state } of expectations) {
      const taskResponse = await app.inject({
        method: "POST",
        payload: {
          title: `Action recommendation task ${state}`
        },
        url: "/tasks"
      });
      assert.equal(taskResponse.statusCode, 201);
      const task = (
        JSON.parse(taskResponse.body) as { readonly task: { readonly id: string } }
      ).task;

      updateTaskState(databasePath, task.id, state);

      const actionsResponse = await app.inject({
        method: "GET",
        url: `/tasks/${task.id}/actions`
      });
      assert.equal(actionsResponse.statusCode, 200);
      const actions = (JSON.parse(actionsResponse.body) as {
        readonly actions: ReadonlyArray<{
          readonly id: string;
          readonly isRecommended: boolean;
        }>;
      }).actions;

      assert.deepEqual(
        actions.map((action) => action.id),
        ["research", "plan", "implement", "breakdown", "code_review"]
      );
      assert.deepEqual(
        actions.filter((action) => action.isRecommended).map((action) => action.id),
        recommendedIds,
        state
      );
    }
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("session prompt endpoint renders seeded templates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-actions-prompt-"));
  const databasePath = join(dir, "tasker.sqlite");
  const app = await createApp({
    databasePath,
    linearApiKey: null,
    publicApiBaseUrl: "http://127.0.0.1:3000"
  });
  await seedTaskActionDefaults(databasePath);

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        description: "Prompt endpoint description",
        title: "Prompt endpoint task"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (JSON.parse(taskResponse.body) as { readonly task: { readonly id: string } })
      .task;

    const sessionResponse = await app.inject({
      method: "POST",
      payload: {
        actionId: "plan",
        claimed: false,
        provider: "codex"
      },
      url: `/tasks/${task.id}/sessions`
    });
    assert.equal(sessionResponse.statusCode, 201);
    const created = JSON.parse(sessionResponse.body) as {
      readonly session: { readonly id: string };
    };
    assert.ok(created.session.id);

    const defaultPromptResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/tasks/${task.id}/sessions/${created.session.id}/prompt`
    });
    assert.equal(defaultPromptResponse.statusCode, 200);
    const defaultPromptBody = JSON.parse(defaultPromptResponse.body) as {
      readonly prompt: string;
    };
    assert.match(defaultPromptBody.prompt, /Create a practical implementation plan/);
    assert.match(defaultPromptBody.prompt, /Prompt endpoint task/);
    assert.match(defaultPromptBody.prompt, /Prompt endpoint description/);
    assert.match(defaultPromptBody.prompt, /http:\/\/127\.0\.0\.1:3000/);

    const promptResponse = await app.inject({
      method: "POST",
      payload: {
        promptOptions: {
          worktree: {
            enabled: true,
            path: "~/custom-wt"
          }
        }
      },
      url: `/tasks/${task.id}/sessions/${created.session.id}/prompt`
    });
    assert.equal(promptResponse.statusCode, 200);
    const promptBody = JSON.parse(promptResponse.body) as { readonly prompt: string };
    assert.match(promptBody.prompt, /Create a practical implementation plan/);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

function updateTaskState(
  databasePath: string,
  taskId: string,
  state: TaskState
): void {
  const database = new SqliteDatabase(databasePath);
  try {
    database
      .prepare("UPDATE tasks SET state = ?, updated_at = updated_at WHERE id = ?")
      .run(state, taskId);
  } finally {
    database.close();
  }
}

void test("session create rejects unknown action ids", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-actions-invalid-"));
  const databasePath = join(dir, "tasker.sqlite");
  const app = await createApp({
    databasePath,
    linearApiKey: null
  });
  await seedTaskActionDefaults(databasePath);

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
    const errorBody = JSON.parse(sessionResponse.body) as { readonly error: string };
    assert.match(errorBody.error, /not-a-real-action/);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});
