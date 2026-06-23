import assert from "node:assert/strict";
import test from "node:test";
import type { TaskEvent } from "../domain/task-event.js";
import { TaskEventBus } from "./task-events.js";

const event: TaskEvent = {
  type: "artifact_registered",
  artifactId: "artifact-1",
  createdBySessionId: null,
  label: "research",
  taskId: "task-1",
  uri: "/tmp/research.md"
};

void test("TaskEventBus publishes to handlers in subscription order", async () => {
  const bus = new TaskEventBus();
  const calls: string[] = [];

  bus.subscribe("artifact_registered", () => {
    calls.push("first");
    return Promise.resolve();
  });
  bus.subscribe("artifact_registered", () => {
    calls.push("second");
    return Promise.resolve();
  });

  await bus.publish(event);

  assert.deepEqual(calls, ["first", "second"]);
});

void test("TaskEventBus awaits each handler before running the next", async () => {
  const bus = new TaskEventBus();
  const calls: string[] = [];
  let finishFirst: (() => void) | undefined;
  const firstHandlerFinished = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });

  bus.subscribe("artifact_registered", async () => {
    calls.push("first-started");
    await firstHandlerFinished;
    calls.push("first-finished");
  });
  bus.subscribe("artifact_registered", () => {
    calls.push("second-started");
    return Promise.resolve();
  });

  const publish = bus.publish(event);
  await Promise.resolve();

  assert.deepEqual(calls, ["first-started"]);
  finishFirst?.();
  await publish;

  assert.deepEqual(calls, [
    "first-started",
    "first-finished",
    "second-started"
  ]);
});

void test("TaskEventBus propagates handler failures and stops dispatch", async () => {
  const bus = new TaskEventBus();
  const error = new Error("handler failed");
  const calls: string[] = [];

  bus.subscribe("artifact_registered", () => {
    calls.push("first");
    return Promise.reject(error);
  });
  bus.subscribe("artifact_registered", () => {
    calls.push("second");
    return Promise.resolve();
  });

  await assert.rejects(bus.publish(event), error);
  assert.deepEqual(calls, ["first"]);
});
