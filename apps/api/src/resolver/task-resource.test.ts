import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("task resources can register PR links", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-resource-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const taskResponse = await app.inject({
      method: "POST",
      payload: {
        title: "Resource registration"
      },
      url: "/tasks"
    });
    assert.equal(taskResponse.statusCode, 201);
    const task = (readJson(taskResponse.body) as {
      readonly task: { readonly id: string };
    }).task;

    const createResourceResponse = await app.inject({
      method: "POST",
      payload: {
        kind: "pr",
        label: "Implementation PR",
        uri: "https://github.com/sahilsk11/tasker/pull/21"
      },
      url: `/tasks/${task.id}/resources`
    });
    assert.equal(createResourceResponse.statusCode, 201);
    const resource = (readJson(createResourceResponse.body) as {
      readonly resource: {
        readonly id: string;
        readonly kind: string;
        readonly label: string;
        readonly taskId: string;
        readonly uri: string;
      };
    }).resource;
    assert.equal(resource.kind, "pr");
    assert.equal(resource.label, "Implementation PR");
    assert.equal(resource.taskId, task.id);
    assert.equal(resource.uri, "https://github.com/sahilsk11/tasker/pull/21");

    const resourcesResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/resources`
    });
    assert.equal(resourcesResponse.statusCode, 200);
    const resources = (readJson(resourcesResponse.body) as {
      readonly resources: {
        readonly artifacts: ReadonlyArray<{
          readonly id: string;
          readonly kind: string;
          readonly label: string;
          readonly taskId: string;
          readonly uri: string;
        }>;
      };
    }).resources;
    assert.equal(resources.artifacts.length, 1);
    const artifact = resources.artifacts[0];
    assert.ok(artifact);
    assert.equal(artifact.id, resource.id);
    assert.equal(artifact.kind, "pr");
    assert.equal(artifact.label, "Implementation PR");
    assert.equal(artifact.taskId, task.id);
    assert.equal(
      artifact.uri,
      "https://github.com/sahilsk11/tasker/pull/21"
    );
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}
