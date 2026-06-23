import assert from "node:assert/strict";
import test from "node:test";
import { findUnknownPlaceholders } from "@tasker/core";
import { FileTaskActionRepository } from "../repository/task-action.repository.js";
import { renderActionPrompt } from "../service/task-action-prompt.js";
import { getDefaultTaskActionsPath } from "../task-actions/catalog.js";

void test("catalog plan template renders with only known placeholders", async () => {
  const repository = new FileTaskActionRepository(getDefaultTaskActionsPath());
  const plan = await repository.findById("plan");
  assert.ok(plan);
  assert.deepEqual(findUnknownPlaceholders(plan.promptTemplate), []);

  const prompt = renderActionPrompt(plan, {
    action: {
      id: plan.id,
      label: plan.label
    },
    agentProvider: "codex",
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
});
