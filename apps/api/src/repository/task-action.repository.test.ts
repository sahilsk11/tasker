import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";
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
        readonly label: string;
        readonly options: Record<string, unknown> | null;
      }>;
    }).actions;

    assert.equal(actions.length, 6);
    assert.deepEqual(
      actions.map((action) => action.id),
      ["scope", "plan", "breakdown", "implement", "code_review", "new_session"]
    );
    const firstAction = actions[0];
    const implementAction = actions[3];
    assert.ok(firstAction);
    assert.ok(implementAction);
    assert.equal(firstAction.label, "Scope");
    assert.match(firstAction.description, /codebase surface/);
    assert.equal(implementAction.options?.["worktree"] != null, true);
    assert.equal(firstAction.options, null);
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
        actionId: "scope",
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
    assert.match(defaultPromptBody.prompt, /Scope this task before planning or implementation/);
    assert.match(defaultPromptBody.prompt, /Relevant codebase areas/);
    assert.match(defaultPromptBody.prompt, /Prompt endpoint task/);
    assert.match(defaultPromptBody.prompt, /Prompt endpoint description/);
    assert.match(defaultPromptBody.prompt, /http:\/\/127\.0\.0\.1:3000/);

    const promptResponse = await app.inject({
      method: "POST",
      payload: {
        promptOptions: {
          workingPath: "/tmp/tasker-project"
        }
      },
      url: `/tasks/${task.id}/sessions/${created.session.id}/prompt`
    });
    assert.equal(promptResponse.statusCode, 200);
    const promptBody = JSON.parse(promptResponse.body) as { readonly prompt: string };
    assert.match(promptBody.prompt, /Scope this task before planning or implementation/);
    assert.match(promptBody.prompt, /## Working path/);
    assert.match(promptBody.prompt, /\/tmp\/tasker-project/);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

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

void test("task action settings can be updated through the catalog endpoint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-actions-settings-"));
  const databasePath = join(dir, "tasker.sqlite");
  const app = await createApp({
    databasePath,
    linearApiKey: null
  });
  await seedTaskActionDefaults(databasePath);

  try {
    const updateResponse = await app.inject({
      method: "PATCH",
      payload: {
        description: "Plan the next concrete implementation steps.",
        enabled: false,
        iconName: "workflow",
        label: "Plan next",
        sortOrder: 8
      },
      url: "/actions/plan"
    });
    assert.equal(updateResponse.statusCode, 200);
    const updated = JSON.parse(updateResponse.body) as {
      readonly action: {
        readonly description: string;
        readonly enabled: boolean;
        readonly iconName: string;
        readonly label: string;
        readonly sortOrder: number;
      };
    };
    assert.equal(updated.action.label, "Plan next");
    assert.equal(updated.action.enabled, false);
    assert.equal(updated.action.iconName, "workflow");
    assert.equal(updated.action.sortOrder, 8);

    const catalogResponse = await app.inject({
      method: "GET",
      url: "/actions"
    });
    assert.equal(catalogResponse.statusCode, 200);
    const catalog = JSON.parse(catalogResponse.body) as {
      readonly actions: ReadonlyArray<{ readonly id: string; readonly enabled: boolean }>;
    };
    assert.ok(catalog.actions.some((action) => action.id === "plan" && !action.enabled));

    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Settings catalog task"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (JSON.parse(taskResponse.body) as { readonly task: { readonly id: string } })
      .task;

    const enabledActionsResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/actions`
    });
    assert.equal(enabledActionsResponse.statusCode, 200);
    const enabledActions = JSON.parse(enabledActionsResponse.body) as {
      readonly actions: ReadonlyArray<{ readonly id: string }>;
    };
    assert.equal(enabledActions.actions.some((action) => action.id === "plan"), false);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});
