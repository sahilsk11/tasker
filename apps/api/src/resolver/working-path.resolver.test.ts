import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    assert.equal(initial.settings.generatedUrlMode, "localhost");
    assert.equal(initial.settings.publicAppBaseUrl, null);

    const updateResponse = await app.inject({
      method: "PATCH",
      payload: {
        defaultWorkingDirectory: `  ${dir}  `,
        defaultWorktreePath: "  ~/custom-wt  ",
        generatedUrlMode: "public",
        publicAppBaseUrl: "  http://tasker.localhost:48273/api/  "
      },
      url: "/working-paths/settings"
    });
    assert.equal(updateResponse.statusCode, 200);
    const updated = readSettings(updateResponse.body);
    assert.equal(updated.defaultWorkingDirectory, dir);
    assert.equal(updated.defaultWorktreePath, "~/custom-wt");
    assert.equal(updated.generatedUrlMode, "public");
    assert.equal(updated.publicAppBaseUrl, "http://tasker.localhost:48273");

    const clearResponse = await app.inject({
      method: "PATCH",
      payload: { defaultWorkingDirectory: "", generatedUrlMode: "localhost" },
      url: "/working-paths/settings"
    });
    assert.equal(clearResponse.statusCode, 200);
    const cleared = readSettings(clearResponse.body);
    assert.equal(cleared.defaultWorkingDirectory, null);
    assert.equal(cleared.defaultWorktreePath, "~/custom-wt");
    assert.equal(cleared.generatedUrlMode, "localhost");
    assert.equal(cleared.publicAppBaseUrl, "http://tasker.localhost:48273");

    const invalidResponse = await app.inject({
      method: "PATCH",
      payload: { defaultWorktreePath: "" },
      url: "/working-paths/settings"
    });
    assert.equal(invalidResponse.statusCode, 400);

    const missingDirectoryResponse = await app.inject({
      method: "PATCH",
      payload: { defaultWorkingDirectory: join(dir, "missing") },
      url: "/working-paths/settings"
    });
    assert.equal(missingDirectoryResponse.statusCode, 400);

    const filePath = join(dir, "file.txt");
    await writeFile(filePath, "not a directory");
    const filePathResponse = await app.inject({
      method: "PATCH",
      payload: { defaultWorkingDirectory: filePath },
      url: "/working-paths/settings"
    });
    assert.equal(filePathResponse.statusCode, 400);

    const missingPublicUrlResponse = await app.inject({
      method: "PATCH",
      payload: { generatedUrlMode: "public", publicAppBaseUrl: "" },
      url: "/working-paths/settings"
    });
    assert.equal(missingPublicUrlResponse.statusCode, 400);

    const invalidPublicUrlResponse = await app.inject({
      method: "PATCH",
      payload: { publicAppBaseUrl: "ftp://tasker.localhost" },
      url: "/working-paths/settings"
    });
    assert.equal(invalidPublicUrlResponse.statusCode, 400);
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
    readonly generatedUrlMode: "localhost" | "public";
    readonly publicAppBaseUrl: string | null;
  };
} {
  return readJson(body) as {
    readonly settings: {
      readonly defaultWorkingDirectory: string | null;
      readonly defaultWorktreePath: string;
      readonly generatedUrlMode: "localhost" | "public";
      readonly publicAppBaseUrl: string | null;
    };
  };
}

function readSettings(body: string): {
  readonly defaultWorkingDirectory: string | null;
  readonly defaultWorktreePath: string;
  readonly generatedUrlMode: "localhost" | "public";
  readonly publicAppBaseUrl: string | null;
} {
  return (readJson(body) as {
    readonly settings: {
      readonly defaultWorkingDirectory: string | null;
      readonly defaultWorktreePath: string;
      readonly generatedUrlMode: "localhost" | "public";
      readonly publicAppBaseUrl: string | null;
    };
  }).settings;
}
