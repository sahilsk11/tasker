import assert from "node:assert/strict";
import test from "node:test";
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

void test("runCli returns structured help output", async () => {
  const result = await runCli(["--help"], {});

  assert.equal(result.exitCode, 0);
  assert.equal((JSON.parse(result.output) as { readonly ok: boolean }).ok, true);
});

void test("runCli creates a task session", async () => {
  await withMockFetch(
    (input, init) => {
      assert.equal(String(input), "http://127.0.0.1:7501/tasks/task-1/sessions");
      assert.equal(init?.method, "POST");
      assert.deepEqual(parseJsonBody(init), {
        actionId: "scope",
        claimed: false,
        metadata: {
          reportedCwd: "/repo"
        },
        provider: "codex",
        providerId: "thread-1",
        transcriptPath: "/tmp/transcript.jsonl"
      });

      return Promise.resolve(jsonResponse(201, {
        session: {
          actionId: "scope",
          claimedAt: null,
          createdAt: "2026-06-22T00:00:00.000Z",
          displayTitle: null,
          id: "session-1",
          metadata: {
            reportedCwd: "/repo"
          },
          provider: "codex",
          providerId: "thread-1",
          taskId: "task-1",
          transcriptPath: "/tmp/transcript.jsonl"
        }
      }));
    },
    async () => {
      const result = await runCli(
        [
          "--api-base-url",
          "http://127.0.0.1:7501",
          "sessions",
          "create",
          "--task-id",
          "task-1",
          "--provider",
          "codex",
          "--action-id",
          "scope",
          "--unclaimed",
          "--provider-id",
          "thread-1",
          "--transcript-path",
          "/tmp/transcript.jsonl",
          "--metadata",
          "reportedCwd=/repo"
        ],
        {}
      );

      assert.equal(result.exitCode, 0);
      assert.deepEqual(JSON.parse(result.output) as unknown, {
        data: {
          session: {
            actionId: "scope",
            claimedAt: null,
            createdAt: "2026-06-22T00:00:00.000Z",
            displayTitle: null,
            id: "session-1",
            metadata: {
              reportedCwd: "/repo"
            },
            provider: "codex",
            providerId: "thread-1",
            taskId: "task-1",
            transcriptPath: "/tmp/transcript.jsonl"
          }
        },
        ok: true
      });
    }
  );
});

void test("runCli claims a task session and returns the task overview payload", async () => {
  await withMockFetch(
    (input, init) => {
      assert.equal(String(input), "http://127.0.0.1:7501/sessions/session-1/claim");
      assert.equal(init?.method, "POST");
      assert.deepEqual(parseJsonBody(init), {
        metadata: {
          codexThreadIdEnvPresent: true,
          reportedCwd: "/repo"
        },
        provider: "codex",
        providerId: "thread-1"
      });

      return Promise.resolve(jsonResponse(200, {
        session: {
          actionId: "implement",
          claimedAt: "2026-06-22T00:00:01.000Z",
          createdAt: "2026-06-22T00:00:00.000Z",
          displayTitle: "Implement session CLI",
          id: "session-1",
          metadata: {
            codexThreadIdEnvPresent: true,
            reportedCwd: "/repo"
          },
          provider: "codex",
          providerId: "thread-1",
          taskId: "task-1",
          transcriptPath: null
        },
        taskOverview: {
          action: {
            description: "Implement the task",
            iconName: "code-2",
            id: "implement",
            isRecommended: false,
            label: "Implement",
            options: null
          },
          children: [],
          latestTaskActivityAt: "2026-06-22T00:00:01.000Z",
          resources: {
            artifacts: [],
            pullRequests: [],
            sessions: [
              {
                actionId: "implement",
                claimedAt: "2026-06-22T00:00:01.000Z",
                createdAt: "2026-06-22T00:00:00.000Z",
                displayTitle: "Implement session CLI",
                id: "session-1",
                metadata: {
                  codexThreadIdEnvPresent: true,
                  reportedCwd: "/repo"
                },
                provider: "codex",
                providerId: "thread-1",
                taskId: "task-1",
                transcriptPath: null
              }
            ],
            tickets: []
          },
          task: {
            createdAt: "2026-06-21T00:00:00.000Z",
            description: "Task description",
            id: "task-1",
            parentTaskId: null,
            state: "scoping",
            title: "Task title",
            updatedAt: "2026-06-22T00:00:00.000Z",
            waitingDependencies: [],
            workingDirectory: null
          }
        }
      }));
    },
    async () => {
      const result = await runCli(
        [
          "--api-base-url",
          "http://127.0.0.1:7501",
          "sessions",
          "claim",
          "--session-id",
          "session-1",
          "--provider",
          "codex",
          "--provider-id",
          "thread-1",
          "--metadata",
          "reportedCwd=/repo",
          "--metadata-json",
          "{\"codexThreadIdEnvPresent\":true}"
        ],
        {}
      );

      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.output) as {
        readonly data: {
          readonly taskOverview: {
            readonly latestTaskActivityAt: string;
            readonly resources: {
              readonly sessions: ReadonlyArray<{ readonly id: string }>;
            };
            readonly task: { readonly id: string };
          };
        };
        readonly ok: boolean;
      };
      assert.equal(parsed.ok, true);
      assert.equal(parsed.data.taskOverview.task.id, "task-1");
      assert.equal(parsed.data.taskOverview.latestTaskActivityAt, "2026-06-22T00:00:01.000Z");
      assert.deepEqual(
        parsed.data.taskOverview.resources.sessions.map((session) => session.id),
        ["session-1"]
      );
    }
  );
});

void test("runCli returns structured API errors for already-claimed sessions", async () => {
  await withMockFetch(
    () =>
      Promise.resolve(jsonResponse(
        409,
        {
          error: "Task session session-1 has already been claimed"
        },
        "Conflict"
      )),
    async () => {
      const result = await runCli(
        [
          "--api-base-url",
          "http://127.0.0.1:7501",
          "sessions",
          "claim",
          "--session-id",
          "session-1",
          "--provider-id",
          "thread-2"
        ],
        {}
      );

      assert.equal(result.exitCode, 1);
      assert.deepEqual(JSON.parse(result.output) as unknown, {
        error: {
          body: {
            error: "Task session session-1 has already been claimed"
          },
          code: "api_error",
          message: "Task session session-1 has already been claimed",
          status: 409
        },
        ok: false
      });
    }
  );
});

type MockFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "text">>;

async function withMockFetch(mockFetch: MockFetch, callback: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof fetch;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(
  status: number,
  body: unknown,
  statusText = status >= 400 ? "Error" : "OK"
): Pick<Response, "ok" | "status" | "statusText" | "text"> {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(JSON.stringify(body))
  };
}

function parseJsonBody(init: RequestInit | undefined): unknown {
  assert.ok(init);
  const { body } = init;
  assert.equal(typeof body, "string");
  if (typeof body !== "string") {
    throw new TypeError("Expected string request body");
  }
  return JSON.parse(body) as unknown;
}
