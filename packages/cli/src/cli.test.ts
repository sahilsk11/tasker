import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "@tasker/api/app";
import { createTaskerRuntime, type TaskerRuntime } from "@tasker/api/runtime";
import { runCli } from "./cli.js";

void test("runCli returns plain parse errors", async () => {
  const result = await runCli(["unknown"], {});

  assert.equal(result.exitCode, 2);
  assert.equal(result.output, "Error: Unknown command: unknown");
  assertNotJson(result.output);
});

void test("runCli returns plain help output without opening the runtime", async () => {
  const result = await runCli(["--help"], {});

  assert.equal(result.exitCode, 0);
  assert.equal(result.output, getExpectedHelpText());
  assert.throws(() => JSON.parse(result.output));

  const defaultResult = await runCli([], {});
  assert.deepEqual(defaultResult, result);
});

void test("runCli dispatches default commands locally without fetch", async () => {
  await withTemporaryDatabase(async ({ databasePath, env }) => {
    const task = await seedTask(databasePath);

    await withThrowingFetch(async () => {
      const runtime = await runCli(["runtime"], env);
      assert.equal(runtime.exitCode, 0);
      assert.match(runtime.output, /Tasker runtime OK/);
      assert.match(runtime.output, /Service: tasker-api/);
      assert.match(runtime.output, new RegExp(escapeRegExp(`Database: ${databasePath}`)));
      assertNotJson(runtime.output);

      const artifact = await runCli(
        [
          "artifacts",
          "register",
          "--task-id",
          task.id,
          "--label",
          "implement",
          "--uri",
          "/tmp/implement.md"
        ],
        env
      );
      assert.equal(artifact.exitCode, 0);
      assert.match(artifact.output, /Task artifact registered/);
      assert.match(artifact.output, new RegExp(escapeRegExp(`Task ID: ${task.id}`)));
      assert.match(artifact.output, /Label: implement/);
      assertNotJson(artifact.output);

      const pullRequest = await runCli(
        [
          "pull-requests",
          "register",
          "--task-id",
          task.id,
          "--url",
          "https://github.com/owner/repo/pull/12"
        ],
        env
      );
      assert.equal(pullRequest.exitCode, 0);
      assert.match(pullRequest.output, /Task pull request registered/);
      assert.match(pullRequest.output, new RegExp(escapeRegExp(`Task ID: ${task.id}`)));
      assert.match(pullRequest.output, /URL: https:\/\/github.com\/owner\/repo\/pull\/12/);
      assertNotJson(pullRequest.output);

      const rootTask = await runCli(["tasks", "create", "--title", "CLI root task"], env);
      assert.equal(rootTask.exitCode, 0);
      const rootTaskOutput = readTaskOutput(rootTask.output);
      assert.equal(rootTaskOutput.task.title, "CLI root task");
      assert.equal(rootTaskOutput.task.description, null);
      assert.equal(rootTaskOutput.task.parentTaskId, null);
      assert.equal(rootTaskOutput.task.state, "ready");
      assert.equal(rootTaskOutput.task.workingDirectory, null);

      const childTask = await runCli(
        [
          "tasks",
          "create",
          "--title",
          "CLI child task",
          "--description",
          "Child description",
          "--parent-task-id",
          rootTaskOutput.task.id,
          "--working-directory",
          "null"
        ],
        env
      );
      assert.equal(childTask.exitCode, 0);
      const childTaskOutput = readTaskOutput(childTask.output);
      assert.equal(childTaskOutput.task.title, "CLI child task");
      assert.equal(childTaskOutput.task.description, "Child description");
      assert.equal(childTaskOutput.task.parentTaskId, rootTaskOutput.task.id);
      assert.equal(childTaskOutput.task.workingDirectory, null);

      const workingDirectoryTask = await runCli(
        [
          "tasks",
          "create",
          "--title=CLI working directory task",
          "--working-directory",
          `  ${dirname(databasePath)}  `
        ],
        env
      );
      assert.equal(workingDirectoryTask.exitCode, 0);
      const workingDirectoryTaskOutput = readTaskOutput(workingDirectoryTask.output);
      assert.equal(
        workingDirectoryTaskOutput.task.workingDirectory,
        dirname(databasePath)
      );

      const created = await runCli(
        [
          "sessions",
          "create",
          "--task-id",
          task.id,
          "--provider",
          "codex",
          "--unclaimed",
          "--metadata",
          "reportedCwd=/repo"
        ],
        env
      );
      assert.equal(created.exitCode, 0);
      assert.match(created.output, /Task session created/);
      assert.match(created.output, new RegExp(escapeRegExp(`Task ID: ${task.id}`)));
      assert.match(created.output, /Provider: codex/);
      assert.match(created.output, /Claimed: no/);
      assertNotJson(created.output);
      const createdSessionId = readOutputValue(created.output, "Session ID");

      const claimed = await runCli(
        [
          "sessions",
          "claim",
          "--session-id",
          createdSessionId,
          "--provider",
          "codex",
          "--provider-id",
          "thread-1",
          "--metadata-json",
          "{\"codexThreadIdEnvPresent\":true}"
        ],
        env
      );
      assert.equal(claimed.exitCode, 0);
      assert.match(claimed.output, /Task session claimed/);
      assert.match(claimed.output, new RegExp(escapeRegExp(`Session ID: ${createdSessionId}`)));
      assert.match(claimed.output, /Provider ID: thread-1/);
      assert.match(claimed.output, /Claimed: yes/);
      assertNotJson(claimed.output);
    });

    await withRuntime(databasePath, async (runtime) => {
      const resources = await runtime.services.task.getResources(task.id);
      assert.equal(resources.artifacts.length, 1);
      assert.equal(resources.pullRequests.length, 1);
      assert.equal(resources.sessions.length, 1);

      const rootTasks = await runtime.services.task.listTasks({ parentTaskId: null });
      const rootTask = rootTasks.find((candidate) => candidate.title === "CLI root task");
      assert.ok(rootTask);
      const childTasks = await runtime.services.task.listChildren(rootTask.id);
      assert.deepEqual(childTasks.map((child) => child.title), ["CLI child task"]);
    });
  });
});

void test("runCli creates tasks readable through a real Fastify app", async () => {
  await withTemporaryDatabase(async ({ databasePath, env }) => {
    const result = await runCli(
      [
        "tasks",
        "create",
        "--title",
        "Wire readable task",
        "--description",
        "Created through CLI"
      ],
      env
    );
    assert.equal(result.exitCode, 0);
    const created = readTaskOutput(result.output).task;

    const app = await createApp({
      databasePath,
      linearApiKey: null
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: `/tasks/${created.id}`
      });
      assert.equal(response.statusCode, 200);
      const read = readTaskOutput(response.body).task;
      assert.equal(read.id, created.id);
      assert.equal(read.title, "Wire readable task");
      assert.equal(read.description, "Created through CLI");
      assert.equal(read.parentTaskId, null);
      assert.equal(read.state, "ready");
      assert.equal(read.workingDirectory, null);
    } finally {
      await app.close();
    }
  });
});

void test("runCli returns plain API errors for already-claimed sessions", async () => {
  await withTemporaryDatabase(async ({ databasePath, env }) => {
    const { session } = await withRuntime(databasePath, async (runtime) => {
      const task = await runtime.services.task.createTask({
        description: "Task description",
        parentTaskId: null,
        title: "Task title"
      });
      const session = await runtime.services.task.addSession(task.id, {
        provider: "codex",
        providerId: "thread-1"
      });
      return { session };
    });

    const result = await runCli(
      [
        "sessions",
        "claim",
        "--session-id",
        session.id,
        "--provider-id",
        "thread-2"
      ],
      env
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.output, `Error: Task session ${session.id} has already been claimed`);
    assertNotJson(result.output);
  });
});

async function seedTask(databasePath: string): Promise<{ readonly id: string }> {
  return withRuntime(databasePath, async (runtime) =>
    runtime.services.task.createTask({
      description: "Task description",
      parentTaskId: null,
      title: "Task title"
    })
  );
}

async function withTemporaryDatabase(
  callback: (input: {
    readonly databasePath: string;
    readonly env: NodeJS.ProcessEnv;
  }) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "tasker-cli-test-"));
  const databasePath = join(directory, "tasker.sqlite");
  try {
    await callback({
      databasePath,
      env: {
        DATABASE_PATH: databasePath,
        LINEAR_API_KEY: ""
      }
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function withRuntime<T>(
  databasePath: string,
  callback: (runtime: TaskerRuntime) => Promise<T>
): Promise<T> {
  const runtime = createTaskerRuntime({
    agentRunProvider: "codex",
    databasePath,
    linearApiKey: null
  });
  try {
    return await callback(runtime);
  } finally {
    await runtime.close();
  }
}

async function withThrowingFetch(callback: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const throwingFetch: typeof globalThis.fetch = () => {
    throw new Error("CLI local dispatch must not call fetch");
  };
  globalThis.fetch = throwingFetch;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function getExpectedHelpText(): string {
  return [
    "Usage: tasker <command>",
    "",
    "Commands:",
    "  runtime          Fetch Tasker API runtime details",
    "  artifacts register      Register a task artifact",
    "  pull-requests register  Register a task pull request",
    "  tasks create     Create a task",
    "  sessions create  Create a task session",
    "  sessions claim   Claim an existing task session",
    "  --help           Show this help",
    "",
    "Examples:",
    "  tasker artifacts register --task-id <taskId> --label implement --uri /tmp/notes.md",
    "  tasker pull-requests register --task-id <taskId> --url https://github.com/OWNER/REPO/pull/1",
    "  tasker tasks create --title \"Build importer\" --working-directory $PWD",
    "  tasker sessions create --task-id <taskId> --provider codex --unclaimed",
    "  tasker sessions claim --session-id <sessionId> --provider codex --metadata reportedCwd=$PWD"
  ].join("\n");
}

function assertNotJson(value: string): void {
  assert.throws(() => JSON.parse(value));
}

function readTaskOutput(value: string): {
  readonly task: {
    readonly description: string | null;
    readonly id: string;
    readonly parentTaskId: string | null;
    readonly state: string;
    readonly title: string;
    readonly workingDirectory: string | null;
  };
} {
  return JSON.parse(value) as {
    readonly task: {
      readonly description: string | null;
      readonly id: string;
      readonly parentTaskId: string | null;
      readonly state: string;
      readonly title: string;
      readonly workingDirectory: string | null;
    };
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readOutputValue(output: string, label: string): string {
  const line = output
    .split("\n")
    .find((candidate) => candidate.startsWith(`${label}: `));
  assert.ok(line, `Missing ${label} in output:\n${output}`);
  return line.slice(label.length + 2);
}
