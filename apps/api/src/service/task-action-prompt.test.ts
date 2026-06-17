import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findUnknownPlaceholders } from "@tasker/core";
import { createDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { SqliteTaskActionRepository } from "../repository/task-action.repository.js";
import { renderActionPrompt } from "../service/task-action-prompt.js";
import { seedTaskActionDefaults } from "../test/seed-task-action-defaults.js";

void test("seeded plan template renders with only known placeholders", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tasker-task-action-prompt-"));
  const databasePath = join(dir, "tasker.sqlite");

  try {
    migrate({ databasePath });
    await seedTaskActionDefaults(databasePath);
    const db = createDb({ path: databasePath });
    try {
      const repository = new SqliteTaskActionRepository(db);
      const plan = await repository.findById("plan");
      assert.ok(plan);
      assert.deepEqual(findUnknownPlaceholders(plan.promptTemplate), []);

      const prompt = renderActionPrompt(plan, {
        action: {
          id: "plan",
          label: plan.label
        },
        apiBaseUrl: "http://127.0.0.1:3001",
        sessionId: "session-1",
        taskDescription: "Example description",
        taskId: "task-1",
        taskTitle: "Example task"
      });

      assert.match(prompt, /Create a practical implementation plan/);
      assert.match(prompt, /## Tasker session claim/);
      assert.match(prompt, /\/tasks\/task-1\/artifacts/);
      assert.match(prompt, /\/tasks\/task-1\/pull-requests/);
    } finally {
      await db.destroy();
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
