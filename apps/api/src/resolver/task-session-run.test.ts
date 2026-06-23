import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";
import type {
  StartedTaskSession,
  StartTaskSessionInput,
  TaskSessionProvider
} from "../service/session-provider.js";
import { getDefaultTaskActionsPath } from "../task-actions/catalog.js";

void test("action prompt sessions can be launched through a configured provider", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-session-run-"));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = await copyTaskActionCatalog(dir);
  const launches: StartTaskSessionInput[] = [];
  const provider: TaskSessionProvider = {
    provider: "kanna",
    startSession(input): Promise<StartedTaskSession> {
      launches.push(input);
      return Promise.resolve({
        launch: {
          metadata: {
            fakeChatId: "chat-123"
          },
          openUrl: "http://agent.local/chat/chat-123",
          provider: "kanna"
        }
      });
    }
  };
  const app = await createApp({
    agentRunProvider: "kanna",
    databasePath,
    linearApiKey: null,
    sessionProviders: [provider],
    taskActionsPath
  });

  try {
    const task = await createTask(app);
    const session = await createUnclaimedSession(app, task.id);

    const emptyPromptResponse = await app.inject({
      method: "POST",
      payload: {
        prompt: "",
        workingPath: "/tmp/tasker"
      },
      url: `/tasks/${task.id}/sessions/${session.id}/run`
    });
    assert.equal(emptyPromptResponse.statusCode, 400);

    const emptyWorkingPathResponse = await app.inject({
      method: "POST",
      payload: {
        prompt: "run this prompt",
        workingPath: ""
      },
      url: `/tasks/${task.id}/sessions/${session.id}/run`
    });
    assert.equal(emptyWorkingPathResponse.statusCode, 400);

    const response = await app.inject({
      method: "POST",
      payload: {
        prompt: "  run this prompt  ",
        workingPath: "  /tmp/tasker  "
      },
      url: `/tasks/${task.id}/sessions/${session.id}/run`
    });
    assert.equal(response.statusCode, 200);
    const body = readJson(response.body) as {
      readonly launch: {
        readonly metadata: Record<string, unknown>;
        readonly openUrl: string;
        readonly provider: string;
      };
      readonly session: {
        readonly claimedAt: string | null;
        readonly metadata: Record<string, unknown> | null;
        readonly provider: string;
        readonly providerId: string | null;
      };
    };
    assert.equal(body.launch.provider, "kanna");
    assert.equal(body.launch.openUrl, "http://agent.local/chat/chat-123");
    assert.deepEqual(body.launch.metadata, { fakeChatId: "chat-123" });
    assert.equal(body.session.claimedAt, null);
    assert.equal(body.session.provider, "codex");
    assert.equal(body.session.providerId, null);
    assert.equal(body.session.metadata, null);
    assert.equal(launches.length, 1);
    const launch = launches[0];
    assert.ok(launch);
    assert.equal(launch.prompt, "run this prompt");
    assert.equal(launch.task.id, task.id);
    assert.equal(launch.session.id, session.id);
    assert.equal(launch.workingPath, "/tmp/tasker");

    const sessionsResponse = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}/sessions`
    });
    assert.equal(sessionsResponse.statusCode, 200);
    assert.deepEqual(readSessionIds(sessionsResponse.body), []);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("launching an already claimed session is rejected before provider startup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-session-run-claimed-"));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = await copyTaskActionCatalog(dir);
  let launchCount = 0;
  const provider: TaskSessionProvider = {
    provider: "kanna",
    startSession(): Promise<StartedTaskSession> {
      launchCount += 1;
      return Promise.resolve({
        launch: {
          openUrl: "http://agent.local/chat/chat-123",
          provider: "kanna"
        }
      });
    }
  };
  const app = await createApp({
    agentRunProvider: "kanna",
    databasePath,
    linearApiKey: null,
    sessionProviders: [provider],
    taskActionsPath
  });

  try {
    const task = await createTask(app);
    const session = await createClaimedSession(app, task.id);
    const response = await app.inject({
      method: "POST",
      payload: {
        prompt: "run this prompt",
        workingPath: "/tmp/tasker"
      },
      url: `/tasks/${task.id}/sessions/${session.id}/run`
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /has already been claimed/u);
    assert.equal(launchCount, 0);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("launching a session through an unsupported provider is rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-session-run-unsupported-"));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = await copyTaskActionCatalog(dir);
  const app = await createApp({
    agentRunProvider: "missing-agent",
    databasePath,
    linearApiKey: null,
    taskActionsPath
  });

  try {
    const task = await createTask(app);
    const session = await createUnclaimedSession(app, task.id);
    const response = await app.inject({
      method: "POST",
      payload: {
        prompt: "run it",
        workingPath: "/tmp/tasker"
      },
      url: `/tasks/${task.id}/sessions/${session.id}/run`
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.body, /does not support launching sessions/u);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("action prompt run payload can request Claude Code through Kanna", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-session-run-provider-"));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = await copyTaskActionCatalog(dir);
  const launches: StartTaskSessionInput[] = [];
  const provider: TaskSessionProvider = {
    provider: "kanna",
    startSession(input): Promise<StartedTaskSession> {
      launches.push(input);
      return Promise.resolve({
        launch: {
          metadata: {
            agentProvider: input.requestedAgentProvider,
            fakeChatId: "chat-123"
          },
          provider: "kanna"
        }
      });
    }
  };
  const app = await createApp({
    agentRunProvider: "kanna",
    databasePath,
    linearApiKey: null,
    sessionProviders: [provider],
    taskActionsPath
  });

  try {
    const task = await createTask(app);
    const session = await createUnclaimedSession(app, task.id);
    const response = await app.inject({
      method: "POST",
      payload: {
        agentProvider: "claude-code",
        prompt: "run this prompt",
        workingPath: "/tmp/tasker"
      },
      url: `/tasks/${task.id}/sessions/${session.id}/run`
    });

    assert.equal(response.statusCode, 200);
    const body = readJson(response.body) as {
      readonly launch: {
        readonly metadata: Record<string, unknown>;
        readonly provider: string;
      };
    };
    assert.equal(body.launch.provider, "kanna");
    assert.deepEqual(body.launch.metadata, {
      agentProvider: "claude-code",
      fakeChatId: "chat-123"
    });
    assert.equal(launches.length, 1);
    assert.equal(launches[0]?.requestedProvider, undefined);
    assert.equal(launches[0]?.requestedAgentProvider, "claude-code");
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

void test("action prompt run payload can request Cursor through Kanna", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-session-run-cursor-"));
  const databasePath = join(dir, "tasker.sqlite");
  const taskActionsPath = await copyTaskActionCatalog(dir);
  const launches: StartTaskSessionInput[] = [];
  const provider: TaskSessionProvider = {
    provider: "kanna",
    startSession(input): Promise<StartedTaskSession> {
      launches.push(input);
      return Promise.resolve({
        launch: {
          metadata: {
            agentProvider: input.requestedAgentProvider,
            fakeChatId: "chat-456"
          },
          provider: "kanna"
        }
      });
    }
  };
  const app = await createApp({
    agentRunProvider: "kanna",
    databasePath,
    linearApiKey: null,
    sessionProviders: [provider],
    taskActionsPath
  });

  try {
    const task = await createTask(app);
    const session = await createUnclaimedSession(app, task.id);
    const response = await app.inject({
      method: "POST",
      payload: {
        agentProvider: "cursor",
        prompt: "run this prompt",
        workingPath: "/tmp/tasker"
      },
      url: `/tasks/${task.id}/sessions/${session.id}/run`
    });

    assert.equal(response.statusCode, 200);
    const body = readJson(response.body) as {
      readonly launch: {
        readonly metadata: Record<string, unknown>;
        readonly provider: string;
      };
    };
    assert.equal(body.launch.provider, "kanna");
    assert.deepEqual(body.launch.metadata, {
      agentProvider: "cursor",
      fakeChatId: "chat-456"
    });
    assert.equal(launches.length, 1);
    assert.equal(launches[0]?.requestedAgentProvider, "cursor");
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

async function createTask(
  app: Awaited<ReturnType<typeof createApp>>
): Promise<{ readonly id: string }> {
  const response = await app.inject({
    method: "POST",
    payload: {
      description: "Prompt launch test task.",
      title: "Launch session"
    },
    url: "/tasks"
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as { readonly task: { readonly id: string } }).task;
}

async function createUnclaimedSession(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string
): Promise<{ readonly id: string }> {
  const response = await app.inject({
    method: "POST",
    payload: {
      actionId: "scope",
      claimed: false,
      provider: "codex"
    },
    url: `/tasks/${taskId}/sessions`
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as { readonly session: { readonly id: string } })
    .session;
}

async function createClaimedSession(
  app: Awaited<ReturnType<typeof createApp>>,
  taskId: string
): Promise<{ readonly id: string }> {
  const response = await app.inject({
    method: "POST",
    payload: {
      actionId: "scope",
      provider: "codex"
    },
    url: `/tasks/${taskId}/sessions`
  });
  assert.equal(response.statusCode, 201);
  return (readJson(response.body) as { readonly session: { readonly id: string } })
    .session;
}

function readJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function readSessionIds(value: string): readonly string[] {
  const parsed = readJson(value) as {
    readonly sessions: ReadonlyArray<{ readonly id: string }>;
  };
  return parsed.sessions.map((session) => session.id);
}

async function copyTaskActionCatalog(dir: string): Promise<string> {
  const taskActionsPath = join(dir, "task-actions.json");
  await copyFile(getDefaultTaskActionsPath(), taskActionsPath);
  return taskActionsPath;
}
