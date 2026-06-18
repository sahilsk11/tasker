import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("runtime endpoint reports the active Tasker API identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-runtime-"));
  const databasePath = join(dir, "tasker.sqlite");
  const app = await createApp({
    databasePath,
    linearApiKey: null,
    publicApiBaseUrl: "http://127.0.0.1:3999"
  });

  try {
    const healthResponse = await app.inject({
      method: "GET",
      url: "/health"
    });
    assert.equal(healthResponse.statusCode, 200);
    assert.deepEqual(JSON.parse(healthResponse.body), { ok: true });

    const runtimeResponse = await app.inject({
      method: "GET",
      url: "/runtime"
    });
    assert.equal(runtimeResponse.statusCode, 200);
    const runtime = JSON.parse(runtimeResponse.body) as {
      readonly databasePath: string;
      readonly nodeVersion: string;
      readonly ok: boolean;
      readonly pid: number;
      readonly publicApiBaseUrl: string;
      readonly service: string;
      readonly uptimeSeconds: number;
    };

    assert.equal(runtime.ok, true);
    assert.equal(runtime.service, "tasker-api");
    assert.equal(runtime.databasePath, resolve(databasePath));
    assert.equal(runtime.pid, process.pid);
    assert.equal(runtime.nodeVersion, process.version);
    assert.equal(runtime.publicApiBaseUrl, "http://127.0.0.1:3999");
    assert.equal(typeof runtime.uptimeSeconds, "number");
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});
