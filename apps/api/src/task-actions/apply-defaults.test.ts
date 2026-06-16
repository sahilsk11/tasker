import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { applyTaskActionDefaults } from "./apply-defaults.js";
import { loadTaskActionDefaults } from "./load-defaults.js";

void test("applyTaskActionDefaults inserts missing defaults only by default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-apply-defaults-"));
  const databasePath = join(dir, "tasker.sqlite");

  try {
    migrate({ databasePath });
    const db = createDb({ path: databasePath });
    const defaults = loadTaskActionDefaults();

    try {
      const first = await applyTaskActionDefaults(db, { defaults, mode: "insert-missing" });
      assert.equal(first.inserted.length, defaults.length);
      assert.equal(first.updated.length, 0);
      assert.equal(first.skipped.length, 0);

      const second = await applyTaskActionDefaults(db, { defaults, mode: "insert-missing" });
      assert.equal(second.inserted.length, 0);
      assert.equal(second.updated.length, 0);
      assert.equal(second.skipped.length, defaults.length);
    } finally {
      await db.destroy();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

void test("applyTaskActionDefaults update mode overwrites existing rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-apply-defaults-update-"));
  const databasePath = join(dir, "tasker.sqlite");

  try {
    migrate({ databasePath });
    const db = createDb({ path: databasePath });
    const defaults = loadTaskActionDefaults();

    try {
      await applyTaskActionDefaults(db, { defaults, mode: "insert-missing" });

      const modifiedDefaults = defaults.map((action) =>
        action.id === "plan"
          ? {
              ...action,
              description: "Updated plan description"
            }
          : action
      );

      const result = await applyTaskActionDefaults(db, {
        defaults: modifiedDefaults,
        mode: "update"
      });

      assert.equal(result.updated.length, defaults.length);
      assert.equal(result.inserted.length, 0);

      const row = await db
        .selectFrom("task_actions")
        .select(["description"])
        .where("id", "=", "plan")
        .executeTakeFirstOrThrow();

      assert.equal(row.description, "Updated plan description");
    } finally {
      await db.destroy();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
