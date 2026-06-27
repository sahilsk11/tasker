import assert from "node:assert/strict";
import test from "node:test";
import type { TaskState } from "../domain/task.js";
import type { TaskEvent } from "../domain/task-event.js";
import type { TaskWorkflowRule } from "../domain/task-workflow-rule.js";
import type { TaskRepository } from "../repository/task.repository.js";
import { createTaskStateEventHandler } from "./task-state-events.js";

void test("task state event handler maps resource events to monotonic state updates", async () => {
  const updates: Array<{ readonly taskId: string; readonly state: TaskState }> = [];
  const handler = createTaskStateEventHandler(createTaskRepositoryStub(updates));

  await handler(artifactEvent("research"));
  await handler(artifactEvent("plan"));
  await handler(artifactEvent("implement"));
  await handler({
    type: "pull_request_registered",
    pullRequestId: "pull-request-1",
    taskId: "task-1",
    url: "https://github.com/sahilsk11/tasker/pull/1"
  });

  assert.deepEqual(updates, [
    { taskId: "task-1", state: "scoping" },
    { taskId: "task-1", state: "planning" },
    { taskId: "task-1", state: "implementation" },
    { taskId: "task-1", state: "implementation" }
  ]);
});

void test("task state event handler leaves other artifacts and session events as no-ops", async () => {
  const updates: Array<{ readonly taskId: string; readonly state: TaskState }> = [];
  const handler = createTaskStateEventHandler(createTaskRepositoryStub(updates));

  await handler(artifactEvent("other"));
  await handler({
    type: "session_created",
    actionId: "implement",
    sessionId: "session-1",
    taskId: "task-1"
  });
  await handler({
    type: "session_claimed",
    actionId: "scope",
    sessionId: "session-1",
    taskId: "task-1"
  });

  assert.deepEqual(updates, []);
});

void test("task state event handler applies configured session action rules", async () => {
  const updates: Array<{ readonly taskId: string; readonly state: TaskState }> = [];
  const rules: readonly TaskWorkflowRule[] = [
    {
      conditions: { actionId: "plan" },
      effect: { state: "planning", type: "advance_state" },
      id: "plan-session-advances-planning",
      trigger: "session_created"
    }
  ];
  const handler = createTaskStateEventHandler(
    createTaskRepositoryStub(updates),
    rules
  );

  await handler({
    type: "session_created",
    actionId: "implement",
    sessionId: "session-1",
    taskId: "task-1"
  });
  await handler({
    type: "session_created",
    actionId: "plan",
    sessionId: "session-2",
    taskId: "task-1"
  });

  assert.deepEqual(updates, [{ taskId: "task-1", state: "planning" }]);
});

void test("task state event handler rejects invalid rules on creation", () => {
  assert.throws(
    () =>
      createTaskStateEventHandler(createTaskRepositoryStub([]), [
        {
          conditions: { artifactLabel: "plan" },
          effect: { state: "planning", type: "advance_state" },
          id: "invalid-artifact-condition",
          trigger: "session_created"
        }
      ]),
    /Artifact label conditions only apply to artifact_registered rules/
  );
});

function artifactEvent(
  label: "research" | "plan" | "implement" | "other"
): TaskEvent {
  return {
    type: "artifact_registered",
    artifactId: `artifact-${label}`,
    createdBySessionId: null,
    label,
    taskId: "task-1",
    uri: `/tmp/${label}.md`
  };
}

function createTaskRepositoryStub(
  updates: Array<{ readonly taskId: string; readonly state: TaskState }>
): TaskRepository {
  return {
    create: () => Promise.reject(new Error("Not implemented")),
    createSubtasks: () => Promise.reject(new Error("Not implemented")),
    findById: () => Promise.reject(new Error("Not implemented")),
    findChildren: () => Promise.reject(new Error("Not implemented")),
    listByParentTaskId: () => Promise.reject(new Error("Not implemented")),
    listWaitingDependenciesByTaskIds: () =>
      Promise.reject(new Error("Not implemented")),
    update: () => Promise.reject(new Error("Not implemented")),
    updateStateAtLeast: (taskId, state) => {
      updates.push({ taskId, state });
      return Promise.resolve(null);
    }
  };
}
