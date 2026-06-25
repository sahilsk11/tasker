import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTaskerRuntime, type TaskerRuntime } from "@tasker/api/runtime";
import { runCli } from "./cli.js";

void test("runCli returns structured parse errors", async () => {
  const result = await runCli(["unknown"], {});

  assert.equal(result.exitCode, 2);
  assert.deepEqual(JSON.parse(result.output) as unknown, {
    error: {
      code: "parse_error",
      message: "Unknown command: unknown"
    },
    ok: false
  });
});

void test("runCli returns structured help output without opening the runtime", async () => {
  const result = await runCli(["--help"], {});

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.output) as unknown, {
    data: {
      help: [
        "Usage: tasker <command>",
        "",
        "Commands:",
        "  runtime          Fetch Tasker API runtime details",
        "  artifacts register      Register a task artifact",
        "  pull-requests register  Register a task pull request",
        "  sessions create  Create a task session",
        "  sessions claim   Claim an existing task session",
        "  --help           Show this help",
        "",
        "Examples:",
        "  tasker artifacts register --task-id <taskId> --label implement --uri /tmp/notes.md",
        "  tasker pull-requests register --task-id <taskId> --url https://github.com/OWNER/REPO/pull/1",
        "  tasker sessions create --task-id <taskId> --provider codex --unclaimed",
        "  tasker sessions claim --session-id <sessionId> --provider codex --metadata reportedCwd=$PWD"
      ].join("\n")
    },
    ok: true
  });
});

void test("runCli dispatches default commands locally without fetch", async () => {
  await withTemporaryDatabase(async ({ databasePath, env }) => {
    const task = await seedTask(databasePath);

    await withThrowingFetch(async () => {
      const runtime = parseSuccess(await runCli(["runtime"], env)) as {
        readonly databasePath: string;
        readonly ok: true;
        readonly service: "tasker-api";
      };
      assert.equal(runtime.service, "tasker-api");
      assert.equal(runtime.ok, true);
      assert.equal(runtime.databasePath, databasePath);

      const artifact = parseSuccess(
        await runCli(
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
        )
      ) as {
        readonly artifact: { readonly label: string; readonly taskId: string };
      };
      assert.equal(artifact.artifact.taskId, task.id);
      assert.equal(artifact.artifact.label, "implement");

      const pullRequest = parseSuccess(
        await runCli(
          [
            "pull-requests",
            "register",
            "--task-id",
            task.id,
            "--url",
            "https://github.com/owner/repo/pull/12"
          ],
          env
        )
      ) as {
        readonly pullRequest: { readonly taskId: string; readonly url: string };
      };
      assert.equal(pullRequest.pullRequest.taskId, task.id);
      assert.equal(pullRequest.pullRequest.url, "https://github.com/owner/repo/pull/12");

      const created = parseSuccess(
        await runCli(
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
        )
      ) as {
        readonly session: { readonly claimedAt: string | null; readonly id: string };
      };
      assert.equal(created.session.claimedAt, null);

      const claimed = parseSuccess(
        await runCli(
          [
            "sessions",
            "claim",
            "--session-id",
            created.session.id,
            "--provider",
            "codex",
            "--provider-id",
            "thread-1",
            "--metadata-json",
            "{\"codexThreadIdEnvPresent\":true}"
          ],
          env
        )
      ) as {
        readonly session: {
          readonly claimedAt: string | null;
          readonly metadata: Record<string, unknown> | null;
          readonly providerId: string | null;
        };
        readonly taskOverview: {
          readonly resources: {
            readonly artifacts: readonly unknown[];
            readonly pullRequests: readonly unknown[];
            readonly sessions: ReadonlyArray<{ readonly id: string }>;
          };
          readonly task: { readonly id: string };
        };
      };
      assert.notEqual(claimed.session.claimedAt, null);
      assert.equal(claimed.session.providerId, "thread-1");
      assert.deepEqual(claimed.session.metadata, { codexThreadIdEnvPresent: true });
      assert.equal(claimed.taskOverview.task.id, task.id);
      assert.equal(claimed.taskOverview.resources.artifacts.length, 1);
      assert.equal(claimed.taskOverview.resources.pullRequests.length, 1);
      assert.deepEqual(
        claimed.taskOverview.resources.sessions.map((session) => session.id),
        [created.session.id]
      );
    });

    await withRuntime(databasePath, async (runtime) => {
      const resources = await runtime.services.task.getResources(task.id);
      assert.equal(resources.artifacts.length, 1);
      assert.equal(resources.pullRequests.length, 1);
      assert.equal(resources.sessions.length, 1);
    });
  });
});

void test("runCli returns structured API errors for already-claimed sessions", async () => {
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
    assert.deepEqual(JSON.parse(result.output) as unknown, {
      error: {
        body: {
          error: `Task session ${session.id} has already been claimed`
        },
        code: "api_error",
        message: `Task session ${session.id} has already been claimed`,
        status: 409
      },
      ok: false
    });
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

function parseSuccess(result: {
  readonly exitCode: number;
  readonly output: string;
}): unknown {
  assert.equal(result.exitCode, 0, result.output);
  const parsed = JSON.parse(result.output) as { readonly data: unknown; readonly ok: boolean };
  assert.equal(parsed.ok, true);
  return parsed.data;
}
