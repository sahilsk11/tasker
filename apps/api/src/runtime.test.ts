import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createTaskerRuntime } from "./runtime.js";
import { getDefaultTaskActionsPath } from "./task-actions/catalog.js";

void test("runtime creates services against a temporary database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-runtime-services-"));
  const databasePath = join(dir, "tasker.sqlite");
  const runtime = createTaskerRuntime({
    databasePath,
    linearApiKey: null,
    publicApiBaseUrl: "http://127.0.0.1:4999"
  });

  try {
    const task = await runtime.services.task.createTask({
      description: "Runtime service task",
      parentTaskId: null,
      title: "Runtime service smoke"
    });

    assert.equal(task.title, "Runtime service smoke");
    assert.equal(task.description, "Runtime service task");
    assert.equal(task.parentTaskId, null);
    assert.deepEqual(task.waitingDependencies, []);

    assert.deepEqual(await runtime.services.task.listTasks({ parentTaskId: null }), [
      task
    ]);
  } finally {
    await runtime.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("runtime exposes resolved metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-runtime-metadata-"));
  const databasePath = join(dir, "tasker.sqlite");
  const runtime = createTaskerRuntime({
    databasePath,
    linearApiKey: null,
    publicApiBaseUrl: "http://127.0.0.1:5111"
  });

  try {
    assert.deepEqual(
      {
        databasePath: runtime.metadata.databasePath,
        nodeVersion: runtime.metadata.nodeVersion,
        ok: runtime.metadata.ok,
        pid: runtime.metadata.pid,
        publicApiBaseUrl: runtime.metadata.publicApiBaseUrl,
        service: runtime.metadata.service,
        taskActionsPath: runtime.metadata.taskActionsPath,
        uptimeSecondsType: typeof runtime.metadata.uptimeSeconds
      },
      {
        databasePath: resolve(databasePath),
        nodeVersion: process.version,
        ok: true,
        pid: process.pid,
        publicApiBaseUrl: "http://127.0.0.1:5111",
        service: "tasker-api",
        taskActionsPath: resolve(getDefaultTaskActionsPath()),
        uptimeSecondsType: "number"
      }
    );
  } finally {
    await runtime.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("runtime closes the database connection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-runtime-close-"));
  const databasePath = join(dir, "tasker.sqlite");
  const runtime = createTaskerRuntime({
    databasePath,
    linearApiKey: null
  });

  try {
    await runtime.db.selectFrom("tasks").select("id").execute();
    await runtime.close();

    await assert.rejects(() =>
      runtime.db.selectFrom("tasks").select("id").execute()
    );
    await runtime.close();
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
