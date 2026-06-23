import assert from "node:assert/strict";
import test from "node:test";
import { CliError } from "./errors.js";
import { parseArgs } from "./parser.js";

void test("parseArgs parses runtime with an explicit API base URL", () => {
  assert.deepEqual(parseArgs(["--api-base-url", "http://127.0.0.1:3000", "runtime"]), {
    apiBaseUrl: "http://127.0.0.1:3000",
    kind: "runtime"
  });
});

void test("parseArgs parses help", () => {
  assert.deepEqual(parseArgs(["--help"]), { kind: "help" });
});

void test("parseArgs parses sessions create", () => {
  assert.deepEqual(
    parseArgs([
      "--api-base-url=http://127.0.0.1:7501",
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
      apiBaseUrl: "http://127.0.0.1:7501",
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
      error.message === "Unknown command: tasks"
  );
});

void test("parseArgs rejects missing API base URL values", () => {
  assert.throws(
    () => parseArgs(["--api-base-url"]),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === "parse_error" &&
      error.message === "--api-base-url requires a URL value"
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
