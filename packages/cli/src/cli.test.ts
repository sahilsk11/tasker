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
