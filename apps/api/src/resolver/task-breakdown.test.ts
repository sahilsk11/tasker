import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import SqliteDatabase from "better-sqlite3";
import { createApp } from "../app.js";

void test("breakdown endpoints validate, preview, and create child tasks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-breakdown-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null,
    publicApiBaseUrl: "http://127.0.0.1:7501"
  });

  try {
    const databasePath = join(dir, "tasker.sqlite");
    const workingDirectory = await mkdtemp(join(dir, "task-workdir-"));
    const parent = await createTask(app, {
      description: "Large task body",
      title: "Large task",
      workingDirectory
    });
    await createTask(app, {
      parentTaskId: parent.id,
      title: "Existing child"
    });

    const breakdownPath = join(dir, "breakdown.json");
    await writeFile(
      breakdownPath,
      JSON.stringify({
        items: [
          {
            description: "Add the validate, preview, and accept endpoints.",
            dependsOn: [],
            id: "api-contract",
            title: "Add breakdown API"
          },
          {
            description: "Update the break down action prompt.",
            dependsOn: ["api-contract"],
            id: "agent-prompt",
            title: "Teach agents the workflow"
          }
        ],
        schemaVersion: 1,
        summary: "Split API support from prompt wiring.",
        taskId: parent.id
      })
    );

    const validateResponse = await app.inject({
      method: "POST",
      payload: { uri: breakdownPath },
      url: "/breakdowns/validate"
    });
    assert.equal(validateResponse.statusCode, 200);
    const validation = readJson(validateResponse.body) as {
      readonly previewUrl: string;
      readonly valid: boolean;
      readonly warnings: ReadonlyArray<{ readonly code: string }>;
    };
    assert.equal(validation.valid, true);
    assert.equal(
      validation.previewUrl,
      `http://127.0.0.1:7501/breakdowns/preview?uri=${encodeURIComponent(breakdownPath)}`
    );
    assert.deepEqual(
      validation.warnings.map((warning) => warning.code),
      ["task_has_existing_subtasks"]
    );

    const acceptResponse = await app.inject({
      method: "POST",
      payload: { uri: breakdownPath },
      url: "/breakdowns/accept"
    });
    assert.equal(acceptResponse.statusCode, 201);
    const accepted = readJson(acceptResponse.body) as {
      readonly createdSubtasks: ReadonlyArray<{
        readonly id: string;
        readonly parentTaskId: string;
        readonly title: string;
        readonly workingDirectory: string | null;
      }>;
    };
    assert.deepEqual(
      accepted.createdSubtasks.map((task) => task.title),
      ["Add breakdown API", "Teach agents the workflow"]
    );
    assert.deepEqual(
      accepted.createdSubtasks.map((task) => task.parentTaskId),
      [parent.id, parent.id]
    );
    assert.deepEqual(
      accepted.createdSubtasks.map((task) => task.workingDirectory),
      [workingDirectory, workingDirectory]
    );

    const childrenResponse = await app.inject({
      method: "GET",
      url: `/tasks/${parent.id}/children`
    });
    assert.equal(childrenResponse.statusCode, 200);
    const children = (readJson(childrenResponse.body) as {
      readonly tasks: ReadonlyArray<{
        readonly title: string;
        readonly waitingDependencies: ReadonlyArray<{ readonly title: string }>;
        readonly workingDirectory: string | null;
      }>;
    }).tasks;
    assert.deepEqual(
      children.map((child) => child.title),
      ["Existing child", "Add breakdown API", "Teach agents the workflow"]
    );
    assert.deepEqual(
      children.map((child) =>
        child.waitingDependencies.map((dependency) => dependency.title)
      ),
      [[], [], ["Add breakdown API"]]
    );
    assert.deepEqual(
      children.map((child) => child.workingDirectory),
      [null, workingDirectory, workingDirectory]
    );

    const [apiContract] = accepted.createdSubtasks;
    if (apiContract == null) {
      assert.fail("Expected accepted breakdown to create an API contract subtask.");
    }
    const doneResponse = await app.inject({
      method: "PATCH",
      payload: { state: "done" },
      url: `/tasks/${apiContract.id}`
    });
    assert.equal(doneResponse.statusCode, 200);

    const updatedChildrenResponse = await app.inject({
      method: "GET",
      url: `/tasks/${parent.id}/children`
    });
    assert.equal(updatedChildrenResponse.statusCode, 200);
    const updatedChildren = (readJson(updatedChildrenResponse.body) as {
      readonly tasks: ReadonlyArray<{
        readonly title: string;
        readonly waitingDependencies: ReadonlyArray<{ readonly title: string }>;
      }>;
    }).tasks;
    assert.deepEqual(
      updatedChildren.map((child) =>
        child.waitingDependencies.map((dependency) => dependency.title)
      ),
      [[], [], []]
    );

    const database = new SqliteDatabase(databasePath);
    try {
      assert.deepEqual(
        database
          .prepare(
            `
              SELECT dependent.title AS task_title,
                     dependent.working_directory AS task_working_directory,
                     dependency.title AS depends_on_title
              FROM task_dependencies
              JOIN tasks dependent ON dependent.id = task_dependencies.task_id
              JOIN tasks dependency ON dependency.id = task_dependencies.depends_on_task_id
              ORDER BY dependent.created_at, dependency.created_at
            `
          )
          .all(),
        [
          {
            depends_on_title: "Add breakdown API",
            task_title: "Teach agents the workflow",
            task_working_directory: workingDirectory
          }
        ]
      );
    } finally {
      database.close();
    }
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("breakdown validation reports structured errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-breakdown-invalid-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        breakdown: {
          items: [
            {
              description: "Missing a title.",
              id: "missing-title"
            }
          ],
          schemaVersion: 1,
          summary: "Invalid shape.",
          taskId: "missing-task"
        }
      },
      url: "/breakdowns/validate"
    });
    assert.equal(response.statusCode, 200);
    const validation = readJson(response.body) as {
      readonly breakdown: null;
      readonly errors: ReadonlyArray<{ readonly path: string }>;
      readonly valid: boolean;
    };
    assert.equal(validation.valid, false);
    assert.equal(validation.breakdown, null);
    assert.deepEqual(
      validation.errors.map((error) => error.path),
      ["items.0.title"]
    );
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

async function createTask(
  app: Awaited<ReturnType<typeof createApp>>,
  payload: {
    readonly description?: string;
    readonly parentTaskId?: string;
    readonly title: string;
    readonly workingDirectory?: string;
  }
): Promise<{ readonly id: string }> {
  const response = await app.inject({
    method: "POST",
    payload,
    url: "/tasks"
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as { readonly task: { readonly id: string } }).task;
}

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}
