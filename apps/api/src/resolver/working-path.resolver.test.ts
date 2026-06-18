import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.js";

void test("working path settings and options can be stored and read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-working-paths-"));
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
    assert.deepEqual(initial.options, []);

    const settingsResponse = await app.inject({
      method: "PATCH",
      payload: {
        defaultWorkingDirectory: `  ${dir}  `,
        defaultWorktreePath: "  ~/custom-wt  "
      },
      url: "/working-paths/settings"
    });
    assert.equal(settingsResponse.statusCode, 200);
    const settings = readSettings(settingsResponse.body);
    assert.equal(settings.defaultWorkingDirectory, dir);
    assert.equal(settings.defaultWorktreePath, "~/custom-wt");

    const firstOptionResponse = await app.inject({
      method: "POST",
      payload: {
        label: "Tasker",
        path: `  ${dir}  `,
        sortOrder: 2
      },
      url: "/working-paths/options"
    });
    assert.equal(firstOptionResponse.statusCode, 201);
    const firstOption = readOption(firstOptionResponse.body);
    assert.equal(firstOption.label, "Tasker");
    assert.equal(firstOption.path, dir);
    assert.equal(firstOption.sortOrder, 2);

    const secondPath = join(dir, "other");
    const secondOptionResponse = await app.inject({
      method: "POST",
      payload: {
        label: "Other",
        path: secondPath,
        sortOrder: 1
      },
      url: "/working-paths/options"
    });
    assert.equal(secondOptionResponse.statusCode, 201);

    const duplicateResponse = await app.inject({
      method: "POST",
      payload: {
        label: "Duplicate",
        path: dir
      },
      url: "/working-paths/options"
    });
    assert.equal(duplicateResponse.statusCode, 409);

    const listResponse = await app.inject({
      method: "GET",
      url: "/working-paths"
    });
    assert.equal(listResponse.statusCode, 200);
    const listed = readConfig(listResponse.body);
    assert.deepEqual(
      listed.options.map((option) => option.label),
      ["Other", "Tasker"]
    );

    const updateResponse = await app.inject({
      method: "PATCH",
      payload: {
        label: "Tasker main",
        sortOrder: 0
      },
      url: `/working-paths/options/${firstOption.id}`
    });
    assert.equal(updateResponse.statusCode, 200);
    const updated = readOption(updateResponse.body);
    assert.equal(updated.label, "Tasker main");
    assert.equal(updated.sortOrder, 0);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/working-paths/options/${firstOption.id}`
    });
    assert.equal(deleteResponse.statusCode, 204);

    const deletedAgainResponse = await app.inject({
      method: "DELETE",
      url: `/working-paths/options/${firstOption.id}`
    });
    assert.equal(deletedAgainResponse.statusCode, 404);
  } finally {
    await app.close();
    await rm(dir, { force: true, recursive: true });
  }
});

function readJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}

function readConfig(body: string): {
  readonly options: ReadonlyArray<{
    readonly label: string;
    readonly path: string;
  }>;
  readonly settings: {
    readonly defaultWorkingDirectory: string | null;
    readonly defaultWorktreePath: string;
  };
} {
  return readJson(body) as {
    readonly options: ReadonlyArray<{
      readonly label: string;
      readonly path: string;
    }>;
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

function readOption(body: string): {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly sortOrder: number;
} {
  return (readJson(body) as {
    readonly option: {
      readonly id: string;
      readonly label: string;
      readonly path: string;
      readonly sortOrder: number;
    };
  }).option;
}
