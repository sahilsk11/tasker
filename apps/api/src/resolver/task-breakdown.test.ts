import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("breakdown endpoints validate, preview, and create child tasks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-breakdown-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null,
    publicApiBaseUrl: "http://127.0.0.1:7501"
  });

  try {
    const parent = await createTask(app, {
      description: "Large task body",
      title: "Large task"
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

    const previewResponse = await app.inject({
      method: "GET",
      url: `/breakdowns/preview?uri=${encodeURIComponent(breakdownPath)}`
    });
    assert.equal(previewResponse.statusCode, 200);
    const contentType = previewResponse.headers["content-type"];
    if (typeof contentType !== "string") {
      throw new Error("Preview response did not include a string content type.");
    }
    assert.match(contentType, /text\/html/);
    assert.match(previewResponse.body, /Large task/);
    assert.match(previewResponse.body, /Add breakdown API/);
    assert.match(previewResponse.body, /Accept this breakdown/);

    const acceptResponse = await app.inject({
      method: "POST",
      payload: { uri: breakdownPath },
      url: "/breakdowns/accept"
    });
    assert.equal(acceptResponse.statusCode, 201);
    const accepted = readJson(acceptResponse.body) as {
      readonly createdSubtasks: ReadonlyArray<{
        readonly parentTaskId: string;
        readonly title: string;
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

    const childrenResponse = await app.inject({
      method: "GET",
      url: `/tasks/${parent.id}/children`
    });
    assert.equal(childrenResponse.statusCode, 200);
    const children = (readJson(childrenResponse.body) as {
      readonly tasks: ReadonlyArray<{ readonly title: string }>;
    }).tasks;
    assert.deepEqual(
      children.map((child) => child.title),
      ["Existing child", "Add breakdown API", "Teach agents the workflow"]
    );
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
