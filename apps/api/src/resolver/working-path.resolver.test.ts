import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("working path settings can be read and updated", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-working-path-settings-"));
  const app = await createApp({
    databasePath: join(dir, "tasker.sqlite"),
    linearApiKey: null
  });

  try {
    const initialResponse = await app.inject({
      method: "GET",
      url: "/working-paths"
    });
    assert.equal(initialResponse.statusCode, 200);
    const initial = readConfig(initialResponse.body);
    assert.equal(initial.settings.defaultWorkingDirectory, null);
    assert.equal(initial.settings.defaultWorktreePath, "~/wt");

    const updateResponse = await app.inject({
      method: "PATCH",
      payload: {
        defaultWorkingDirectory: `  ${dir}  `,
        defaultWorktreePath: "  ~/custom-wt  "
      },
      url: "/working-paths/settings"
    });
    assert.equal(updateResponse.statusCode, 200);
    const updated = readSettings(updateResponse.body);
    assert.equal(updated.defaultWorkingDirectory, dir);
    assert.equal(updated.defaultWorktreePath, "~/custom-wt");

    const clearResponse = await app.inject({
      method: "PATCH",
      payload: { defaultWorkingDirectory: "" },
      url: "/working-paths/settings"
    });
    assert.equal(clearResponse.statusCode, 200);
    const cleared = readSettings(clearResponse.body);
    assert.equal(cleared.defaultWorkingDirectory, null);
    assert.equal(cleared.defaultWorktreePath, "~/custom-wt");

    const invalidResponse = await app.inject({
      method: "PATCH",
      payload: { defaultWorktreePath: "" },
      url: "/working-paths/settings"
    });
    assert.equal(invalidResponse.statusCode, 400);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}

function readConfig(body: string): {
  readonly settings: {
    readonly defaultWorkingDirectory: string | null;
    readonly defaultWorktreePath: string;
  };
} {
  return readJson(body) as {
    readonly settings: {
      readonly defaultWorkingDirectory: string | null;
      readonly defaultWorktreePath: string;
    };
  };
}

function readSettings(body: string): {
  readonly defaultWorkingDirectory: string | null;
  readonly defaultWorktreePath: string;
} {
  return (readJson(body) as {
    readonly settings: {
      readonly defaultWorkingDirectory: string | null;
      readonly defaultWorktreePath: string;
    };
  }).settings;
}
