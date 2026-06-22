import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getDefaultTaskActionsPath } from "./catalog.js";

void test("default task action catalog path is rooted at TASKER_APP_ROOT", async () => {
  const previousRoot = process.env["TASKER_APP_ROOT"];
  const dir = await mkdtemp(join(tmpdir(), "tasker-root-"));

  try {
    process.env["TASKER_APP_ROOT"] = dir;
    assert.equal(
      getDefaultTaskActionsPath(),
      join(dir, "apps/api/task-actions.json")
    );
  } finally {
    if (previousRoot === undefined) {
      delete process.env["TASKER_APP_ROOT"];
    } else {
      process.env["TASKER_APP_ROOT"] = previousRoot;
    }
    await rm(dir, { force: true, recursive: true });
  }
});
