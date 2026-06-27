import assert from "node:assert/strict";
import test from "node:test";
import type {
  CreateTaskArtifactInput,
  TaskArtifact
} from "../domain/task-artifact.js";
import type { TaskAction } from "../domain/task-action.js";
import type { TaskEvent } from "../domain/task-event.js";
import type {
  CreateTaskPullRequestInput,
  TaskPullRequest
} from "../domain/task-pull-request.js";
import type {
  ClaimTaskSessionInput,
  CreateTaskSessionInput,
  TaskSession
} from "../domain/task-session.js";
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

void test("task service publishes an artifact registration event after persisting an artifact", async () => {
  const task = createTask();
  const session = createSession(task.id);
  const artifact = createArtifact(task.id, session.id);
  const events: TaskEvent[] = [];
  const eventBus = new TaskEventBus();
  eventBus.subscribe("artifact_registered", (event) => {
    events.push(event);
    return Promise.resolve();
  });
  const service = new TaskService(
    createTaskRepositoryStub(task),
    {
      createForTask: (taskId: string, input: CreateTaskArtifactInput) => {
        assert.equal(taskId, task.id);
        assert.deepEqual(input, {
          createdBySessionId: session.id,
          label: "research",
          uri: "/tmp/research.md"
        });
        return Promise.resolve(artifact);
      }
    } as unknown as TaskArtifactRepository,
    emptyPullRequestRepository(),
    {
      findById: (sessionId: string) =>
        Promise.resolve(sessionId === session.id ? session : null)
    } as unknown as TaskSessionRepository,
    emptyTicketRepository(),
    emptyActionRepository(),
    "http://127.0.0.1:3000",
    eventBus,
    new TaskSessionProviderRegistry()
  );

  const result = await service.addArtifact(task.id, {
    createdBySessionId: session.id,
    label: "research",
    uri: "/tmp/research.md"
  });

  assert.equal(result, artifact);
  assert.deepEqual(events, [
    {
      type: "artifact_registered",
      artifactId: artifact.id,
      createdBySessionId: session.id,
      label: "research",
      taskId: task.id,
      uri: artifact.uri
    }
  ]);
});

void test("task service publishes a pull request registration event after persisting a pull request", async () => {
  const task = createTask();
  const pullRequest = createPullRequest(task.id);
  const events: TaskEvent[] = [];
  const eventBus = new TaskEventBus();
  eventBus.subscribe("pull_request_registered", (event) => {
    events.push(event);
    return Promise.resolve();
  });
  const service = new TaskService(
    createTaskRepositoryStub(task),
    emptyArtifactRepository(),
    {
      createForTask: (taskId: string, input: CreateTaskPullRequestInput) => {
        assert.equal(taskId, task.id);
        assert.deepEqual(input, {
          url: "https://github.com/sahilsk11/tasker/pull/42"
        });
        return Promise.resolve(pullRequest);
      }
    } as unknown as TaskPullRequestRepository,
    emptySessionRepository(),
    emptyTicketRepository(),
    emptyActionRepository(),
    "http://127.0.0.1:3000",
    eventBus,
    new TaskSessionProviderRegistry()
  );

  const result = await service.addPullRequest(task.id, {
    url: "https://github.com/sahilsk11/tasker/pull/42"
  });

  assert.equal(result, pullRequest);
  assert.deepEqual(events, [
    {
      type: "pull_request_registered",
      pullRequestId: pullRequest.id,
      taskId: task.id,
      url: pullRequest.url
    }
  ]);
});

void test("task service publishes session lifecycle events after persistence", async () => {
  const task = createTask();
  const session = createSession(task.id);
  const events: TaskEvent[] = [];
  const eventBus = new TaskEventBus();
  eventBus.subscribe("session_created", (event) => {
    events.push(event);
    return Promise.resolve();
  });
  eventBus.subscribe("session_claimed", (event) => {
    events.push(event);
    return Promise.resolve();
  });
  const service = new TaskService(
    createTaskRepositoryStub(task),
    {
      listByTaskId: () => Promise.resolve([])
    } as unknown as TaskArtifactRepository,
    {
      listByTaskId: () => Promise.resolve([])
    } as unknown as TaskPullRequestRepository,
    {
      claim: () => Promise.resolve(session),
      createForTask: (taskId: string, input: CreateTaskSessionInput) => {
        assert.equal(taskId, task.id);
        assert.deepEqual(input, {
          actionId: "scope",
          provider: "codex",
          providerId: "provider-1"
        });
        return Promise.resolve(session);
      },
      listByTaskId: () => Promise.resolve([session])
    } as unknown as TaskSessionRepository,
    emptyTicketRepository(),
    {
      findById: () => Promise.resolve(createAction())
    } as unknown as TaskActionRepository,
    "http://127.0.0.1:3000",
    eventBus,
    new TaskSessionProviderRegistry()
  );

  const created = await service.addSession(task.id, {
    actionId: "scope",
    provider: "codex",
    providerId: "provider-1"
  });
  const claimed = await service.claimSession(session.id, {
    provider: "codex",
    providerId: "provider-1"
  });

  assert.equal(created.id, session.id);
  assert.equal(claimed.session.id, session.id);
  assert.deepEqual(events, [
    {
      type: "session_created",
      actionId: "scope",
      sessionId: session.id,
      taskId: task.id
    },
    {
      type: "session_claimed",
      actionId: "scope",
      sessionId: session.id,
      taskId: task.id
    }
  ]);
});

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

function createArtifact(
  taskId: string,
  createdBySessionId: string | null
): TaskArtifact {
  const now = new Date("2026-06-24T00:00:00.000Z");
  return {
    archivedAt: null,
    createdAt: now,
    createdBySessionId,
    id: "artifact-1",
    label: "research",
    taskId,
    uri: "/tmp/research.md"
  };
}

function createPullRequest(taskId: string): TaskPullRequest {
  const now = new Date("2026-06-24T00:00:00.000Z");
  return {
    createdAt: now,
    id: "pull-request-1",
    taskId,
    url: "https://github.com/sahilsk11/tasker/pull/42"
  };
}

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

function createTaskRepositoryStub(task: Task): TaskRepository {
  return {
    findById: (taskId: string) => Promise.resolve(taskId === task.id ? task : null),
    findChildren: () => Promise.resolve([]),
    listWaitingDependenciesByTaskIds: () => Promise.resolve([]),
    updateStateAtLeast: () =>
      Promise.reject(new Error("TaskService must publish events, not advance state"))
  } as unknown as TaskRepository;
}

function emptyArtifactRepository(): TaskArtifactRepository {
  return {
    listByTaskId: () => Promise.resolve([])
  } as unknown as TaskArtifactRepository;
}

function emptyPullRequestRepository(): TaskPullRequestRepository {
  return {
    listByTaskId: () => Promise.resolve([])
  } as unknown as TaskPullRequestRepository;
}

function emptySessionRepository(): TaskSessionRepository {
  return {
    listByTaskId: () => Promise.resolve([])
  } as unknown as TaskSessionRepository;
}

function emptyTicketRepository(): TaskTicketRepository {
  return {
    listByTaskId: () => Promise.resolve([])
  } as unknown as TaskTicketRepository;
}

function emptyActionRepository(): TaskActionRepository {
  return {
    findById: () => Promise.resolve(null)
  } as unknown as TaskActionRepository;
}
