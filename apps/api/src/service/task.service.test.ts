import assert from "node:assert/strict";
import test from "node:test";
import type { TaskAction } from "../domain/task-action.js";
import type { ClaimTaskSessionInput, TaskSession } from "../domain/task-session.js";
import type { Task } from "../domain/task.js";
import type { TaskActionRepository } from "../repository/task-action.repository.js";
import type { TaskArtifactRepository } from "../repository/task-artifact.repository.js";
import type { TaskPullRequestRepository } from "../repository/task-pull-request.repository.js";
import type { TaskSessionRepository } from "../repository/task-session.repository.js";
import type { TaskTicketRepository } from "../repository/task-ticket.repository.js";
import type { TaskRepository } from "../repository/task.repository.js";
import { TaskSessionProviderRegistry } from "./session-provider.js";
import { TaskEventBus } from "./task-events.js";
import { TaskService } from "./task.service.js";

void test("task service merges flexible claim metadata before claiming a session", async () => {
  const task = createTask();
  const session = createSession(task.id);
  let claimInput: ClaimTaskSessionInput | null = null;
  const service = new TaskService(
    {
      findById: (taskId: string) => Promise.resolve(taskId === task.id ? task : null),
      findChildren: () => Promise.resolve([]),
      listWaitingDependenciesByTaskIds: () => Promise.resolve([])
    } as unknown as TaskRepository,
    {
      listByTaskId: () => Promise.resolve([])
    } as unknown as TaskArtifactRepository,
    {
      listByTaskId: () => Promise.resolve([])
    } as unknown as TaskPullRequestRepository,
    {
      claim: (_sessionId: string, input: ClaimTaskSessionInput) => {
        claimInput = input;
        return Promise.resolve(session);
      },
      listByTaskId: () => Promise.resolve([session])
    } as unknown as TaskSessionRepository,
    {
      listByTaskId: () => Promise.resolve([])
    } as unknown as TaskTicketRepository,
    {
      findById: () => Promise.resolve(createAction())
    } as unknown as TaskActionRepository,
    "http://127.0.0.1:3000",
    new TaskEventBus(),
    new TaskSessionProviderRegistry()
  );

  const result = await service.claimSession("session-1", {
    harness: "codex_exec",
    metadata: {
      codexCliVersion: "0.139.0"
    },
    provider: "codex",
    providerId: "provider-1",
    reportedCwd: "/home/sahil/projects/tasker"
  });

  assert.deepEqual(claimInput, {
    metadata: {
      codexCliVersion: "0.139.0",
      harness: "codex_exec",
      reportedCwd: "/home/sahil/projects/tasker"
    },
    provider: "codex",
    providerId: "provider-1"
  });
  assert.equal(result.session.id, session.id);
  assert.equal(result.taskOverview.task.id, task.id);
});

function createTask(): Task {
  const now = new Date("2026-06-24T00:00:00.000Z");
  return {
    createdAt: now,
    description: "Task description",
    id: "task-1",
    parentTaskId: null,
    state: "ready",
    title: "Task title",
    updatedAt: now,
    workingDirectory: null
  };
}

function createSession(taskId: string): TaskSession {
  const now = new Date("2026-06-24T00:00:00.000Z");
  return {
    actionId: "scope",
    claimedAt: now,
    createdAt: now,
    displayTitle: null,
    id: "session-1",
    metadata: null,
    provider: "codex",
    providerId: "provider-1",
    taskId,
    transcriptPath: null
  };
}

function createAction(): TaskAction {
  return {
    description: "Scope the task",
    iconName: "search",
    id: "scope",
    isRecommended: true,
    label: "Scope",
    options: null
  };
}
