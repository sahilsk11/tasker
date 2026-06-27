import assert from "node:assert/strict";
import test from "node:test";
import { CliError } from "./errors.js";
import { parseArgs } from "./parser.js";

void test("parseArgs parses runtime", () => {
  assert.deepEqual(parseArgs(["runtime"]), {
    kind: "runtime"
  });
});

void test("parseArgs parses help", () => {
  assert.deepEqual(parseArgs(["--help"]), { kind: "help" });
});

void test("parseArgs parses artifacts register", () => {
  for (const label of ["research", "plan", "implement", "other"] as const) {
    assert.deepEqual(
      parseArgs([
        "artifacts",
        "register",
        "--task-id",
        "task-1",
        "--label",
        label,
        "--uri",
        `/tmp/${label}.md`,
        "--created-by-session-id",
        "session-1"
      ]),
      {
        createdBySessionId: "session-1",
        kind: "artifacts_register",
        label,
        taskId: "task-1",
        uri: `/tmp/${label}.md`
      }
    );
  }
});

void test("parseArgs parses pull-requests register", () => {
  assert.deepEqual(
    parseArgs([
      "pull-requests",
      "register",
      "--task-id=task-1",
      "--url=https://github.com/owner/repo/pull/12"
    ]),
    {
      kind: "pull_requests_register",
      taskId: "task-1",
      url: "https://github.com/owner/repo/pull/12"
    }
  );
});

void test("parseArgs parses tasks create", () => {
  assert.deepEqual(
    parseArgs([
      "tasks",
      "create",
      "--title",
      "Root task",
      "--description",
      "Task description",
      "--parent-task-id",
      "parent-1",
      "--working-directory",
      "/repo"
    ]),
    {
      description: "Task description",
      kind: "tasks_create",
      parentTaskId: "parent-1",
      title: "Root task",
      workingDirectory: "/repo"
    }
  );
});

void test("parseArgs parses tasks create inline nullable flags", () => {
  assert.deepEqual(
    parseArgs([
      "tasks",
      "create",
      "--title=Root task",
      "--description=null",
      "--parent-task-id=null",
      "--working-directory=null"
    ]),
    {
      description: null,
      kind: "tasks_create",
      parentTaskId: null,
      title: "Root task",
      workingDirectory: null
    }
  );
});

void test("parseArgs parses sessions create", () => {
  assert.deepEqual(
    parseArgs([
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
      "--metadata-json",
      "{\"reportedCwd\":\"/repo\",\"attempt\":1}",
      "--metadata",
      "harness=cli"
    ]),
    {
      actionId: "scope",
      claimed: false,
      kind: "sessions_create",
      metadata: {
        attempt: 1,
        harness: "cli",
        reportedCwd: "/repo"
      },
      provider: "codex",
      providerId: "thread-1",
      taskId: "task-1",
      transcriptPath: "/tmp/transcript.jsonl"
    }
  );
});

void test("parseArgs parses sessions claim", () => {
  assert.deepEqual(
    parseArgs([
      "sessions",
      "claim",
      "--session-id=session-1",
      "--provider=codex",
      "--provider-id=thread-1",
      "--metadata=reportedCwd=/repo",
      "--metadata-json={\"codexThreadIdEnvPresent\":true}"
    ]),
    {
      kind: "sessions_claim",
      metadata: {
        codexThreadIdEnvPresent: true,
        reportedCwd: "/repo"
      },
      provider: "codex",
      providerId: "thread-1",
      sessionId: "session-1"
    }
  );
});

void test("parseArgs lets later metadata values win deterministically", () => {
  assert.deepEqual(
    parseArgs([
      "sessions",
      "claim",
      "--session-id",
      "session-1",
      "--metadata-json",
      "{\"source\":\"json\",\"keep\":\"yes\"}",
      "--metadata",
      "source=pair"
    ]),
    {
      kind: "sessions_claim",
      metadata: {
        keep: "yes",
        source: "pair"
      },
      sessionId: "session-1"
    }
  );
});

void test("parseArgs rejects unknown commands with a parse error", () => {
  assert.throws(
    () => parseArgs(["tasks"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.exitCode === 2 &&
      error.message === "tasks requires a subcommand: create"
  );
});

void test("parseArgs rejects API base URL as an unknown option", () => {
  assert.throws(
    () => parseArgs(["--api-base-url", "http://127.0.0.1:3000", "runtime"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "Unknown option: --api-base-url"
  );
});

void test("parseArgs rejects invalid artifact labels", () => {
  assert.throws(
    () =>
      parseArgs([
        "artifacts",
        "register",
        "--task-id",
        "task-1",
        "--label",
        "summary",
        "--uri",
        "/tmp/summary.md"
      ]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "--label must be one of: research, plan, implement, other"
  );
});

void test("parseArgs rejects missing artifacts register required flags", () => {
  assert.throws(
    () => parseArgs(["artifacts", "register", "--label", "plan", "--uri", "/tmp/plan.md"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "artifacts register requires --task-id"
  );

  assert.throws(
    () => parseArgs(["artifacts", "register", "--task-id", "task-1", "--uri", "/tmp/plan.md"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "artifacts register requires --label"
  );

  assert.throws(
    () => parseArgs(["artifacts", "register", "--task-id", "task-1", "--label", "plan"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "artifacts register requires --uri"
  );
});

void test("parseArgs rejects missing pull-requests register required flags", () => {
  assert.throws(
    () => parseArgs(["pull-requests", "register", "--url", "https://github.com/owner/repo/pull/12"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "pull-requests register requires --task-id"
  );

  assert.throws(
    () => parseArgs(["pull-requests", "register", "--task-id", "task-1"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "pull-requests register requires --url"
  );
});

void test("parseArgs rejects missing tasks create title", () => {
  assert.throws(
    () => parseArgs(["tasks", "create", "--description", "Task description"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "tasks create requires --title"
  );
});

void test("parseArgs rejects unknown tasks create options", () => {
  assert.throws(
    () => parseArgs(["tasks", "create", "--title", "Task title", "--state", "ready"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "Unknown option for tasks create: --state"
  );
});

void test("parseArgs rejects missing sessions create required flags", () => {
  assert.throws(
    () => parseArgs(["sessions", "create", "--provider", "codex"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "sessions create requires --task-id"
  );

  assert.throws(
    () => parseArgs(["sessions", "create", "--task-id", "task-1"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "sessions create requires --provider"
  );
});

void test("parseArgs rejects missing sessions claim session id", () => {
  assert.throws(
    () => parseArgs(["sessions", "claim", "--provider", "codex"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "sessions claim requires --session-id"
  );
});

void test("parseArgs rejects invalid metadata JSON", () => {
  assert.throws(
    () =>
      parseArgs([
        "sessions",
        "claim",
        "--session-id",
        "session-1",
        "--metadata-json",
        "[]"
      ]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "--metadata-json must be a JSON object or null"
  );
});
