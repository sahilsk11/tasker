import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";
import { getDefaultTaskActionsPath } from "../task-actions/catalog.js";

void test("task actions are loaded from the catalog file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-actions-"));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = await copyTaskActionCatalog(dir);
  const app = await createApp({
    databasePath,
    linearApiKey: null,
    taskActionsPath
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
        readonly isRecommended: boolean;
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
    assert.equal(firstAction.isRecommended, true);
    assert.match(firstAction.description, /codebase surface/);
    assert.equal(implementAction.options?.["worktree"] != null, true);
    assert.equal(firstAction.options, null);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("session prompt endpoint renders catalog templates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-actions-prompt-"));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = await copyTaskActionCatalog(dir);
  await appendTaskAction(taskActionsPath, {
    description: "Verify the skill opt-out placeholder.",
    enabled: true,
    iconName: "message-square-text",
    id: "ignore_skills_probe",
    label: "Ignore skills probe",
    options: null,
    promptTemplate: "# {{taskTitle}}\n\n{{ignoreSkills}}\n\n{{taskDescription}}",
    recommendationStates: [],
    sortOrder: 99
  });
  const app = await createApp({
    databasePath,
    linearApiKey: null,
    publicApiBaseUrl: "http://127.0.0.1:3000",
    publicAppBaseUrl: "http://tasker.localhost:48273",
    taskActionsPath
  });

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
    assert.match(defaultPromptBody.prompt, /http:\/\/tasker\.localhost:48273\/api/);
    assert.doesNotMatch(defaultPromptBody.prompt, /http:\/\/127\.0\.0\.1:3000/);

    const settingsResponse = await app.inject({
      method: "PATCH",
      payload: { generatedUrlMode: "localhost" },
      url: "/working-paths/settings"
    });
    assert.equal(settingsResponse.statusCode, 200);

    const localPromptResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/tasks/${task.id}/sessions/${created.session.id}/prompt`
    });
    assert.equal(localPromptResponse.statusCode, 200);
    const localPromptBody = JSON.parse(localPromptResponse.body) as {
      readonly prompt: string;
    };
    assert.match(localPromptBody.prompt, /http:\/\/127\.0\.0\.1:3000/);

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

    const ignoreSkillsSessionResponse = await app.inject({
      method: "POST",
      payload: {
        actionId: "ignore_skills_probe",
        claimed: false,
        provider: "codex"
      },
      url: `/tasks/${task.id}/sessions`
    });
    assert.equal(ignoreSkillsSessionResponse.statusCode, 201);
    const ignoreSkillsSession = JSON.parse(ignoreSkillsSessionResponse.body) as {
      readonly session: { readonly id: string };
    };

    const ignoreSkillsPromptResponse = await app.inject({
      method: "POST",
      payload: {},
      url: `/tasks/${task.id}/sessions/${ignoreSkillsSession.session.id}/prompt`
    });
    assert.equal(ignoreSkillsPromptResponse.statusCode, 200);
    const ignoreSkillsPromptBody = JSON.parse(ignoreSkillsPromptResponse.body) as {
      readonly prompt: string;
    };
    assert.match(ignoreSkillsPromptBody.prompt, /## Skill usage/);
    assert.match(ignoreSkillsPromptBody.prompt, /Do not use any skills for this task/);
    assert.match(
      ignoreSkillsPromptBody.prompt,
      /Follow the instructions in this prompt directly/
    );
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("session create rejects unknown action ids", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-actions-invalid-"));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = await copyTaskActionCatalog(dir);
  const app = await createApp({
    databasePath,
    linearApiKey: null,
    taskActionsPath
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
  const taskActionsPath = await copyTaskActionCatalog(dir);
  const app = await createApp({
    databasePath,
    linearApiKey: null,
    taskActionsPath
  });

  try {
    const updateResponse = await app.inject({
      method: "PATCH",
      payload: {
        description: "Plan the next concrete implementation steps.",
        enabled: false,
        iconName: "workflow",
        label: "Plan next",
        recommendationStates: ["done"],
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
        readonly recommendationStates: readonly string[];
        readonly sortOrder: number;
      };
    };
    assert.equal(updated.action.label, "Plan next");
    assert.equal(updated.action.enabled, false);
    assert.equal(updated.action.iconName, "workflow");
    assert.deepEqual(updated.action.recommendationStates, ["done"]);
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

    const catalogFile = JSON.parse(await readFile(taskActionsPath, "utf8")) as ReadonlyArray<{
      readonly enabled: boolean;
      readonly id: string;
      readonly label: string;
    }>;
    assert.ok(
      catalogFile.some(
        (action) => action.id === "plan" && action.label === "Plan next" && !action.enabled
      )
    );
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("task actions derive recommendations from configured task states", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-action-recommendations-"));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = await copyTaskActionCatalog(dir);
  const app = await createApp({
    databasePath,
    linearApiKey: null,
    taskActionsPath
  });

  try {
    const readyTaskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Ready action task"
      },
      url: "/tasks"
    });
    assert.equal(readyTaskResponse.statusCode, 201);
    const readyTask = (JSON.parse(readyTaskResponse.body) as {
      readonly task: { readonly id: string };
    }).task;

    const readyActionsResponse = await app.inject({
      method: "GET",
      url: `/tasks/${readyTask.id}/actions`
    });
    assert.equal(readyActionsResponse.statusCode, 200);
    const readyActions = (JSON.parse(readyActionsResponse.body) as {
      readonly actions: ReadonlyArray<{
        readonly id: string;
        readonly isRecommended: boolean;
      }>;
    }).actions;
    assert.deepEqual(
      readyActions.filter((action) => action.isRecommended).map((action) => action.id),
      ["scope", "breakdown"]
    );

    const doneTaskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Done action task"
      },
      url: "/tasks"
    });
    assert.equal(doneTaskResponse.statusCode, 201);
    const doneTask = (JSON.parse(doneTaskResponse.body) as {
      readonly task: { readonly id: string };
    }).task;
    const doneTaskUpdateResponse = await app.inject({
      method: "PATCH",
      payload: {
        state: "done"
      },
      url: `/tasks/${doneTask.id}`
    });
    assert.equal(doneTaskUpdateResponse.statusCode, 200);

    const doneActionsResponse = await app.inject({
      method: "GET",
      url: `/tasks/${doneTask.id}/actions`
    });
    assert.equal(doneActionsResponse.statusCode, 200);
    const doneActions = (JSON.parse(doneActionsResponse.body) as {
      readonly actions: ReadonlyArray<{
        readonly isRecommended: boolean;
      }>;
    }).actions;
    assert.equal(doneActions.length, 6);
    assert.equal(doneActions.some((action) => action.isRecommended), false);

    const updateResponse = await app.inject({
      method: "PATCH",
      payload: {
        recommendationStates: ["done"]
      },
      url: "/actions/code_review"
    });
    assert.equal(updateResponse.statusCode, 200);

    const updatedDoneActionsResponse = await app.inject({
      method: "GET",
      url: `/tasks/${doneTask.id}/actions`
    });
    assert.equal(updatedDoneActionsResponse.statusCode, 200);
    const updatedDoneActions = (JSON.parse(updatedDoneActionsResponse.body) as {
      readonly actions: ReadonlyArray<{
        readonly id: string;
        readonly isRecommended: boolean;
      }>;
    }).actions;
    assert.deepEqual(
      updatedDoneActions
        .filter((action) => action.isRecommended)
        .map((action) => action.id),
      ["code_review"]
    );
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

async function copyTaskActionCatalog(dir: string): Promise<string> {
  const taskActionsPath = join(dir, "task-actions.json");
  await copyFile(getDefaultTaskActionsPath(), taskActionsPath);
  return taskActionsPath;
}

async function appendTaskAction(
  taskActionsPath: string,
  action: Record<string, unknown>
): Promise<void> {
  const existing = JSON.parse(await readFile(taskActionsPath, "utf8")) as unknown[];
  existing.push(action);
  await writeFile(taskActionsPath, JSON.stringify(existing, null, 2));
}
