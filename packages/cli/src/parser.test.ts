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
