import assert from "node:assert/strict";
import test from "node:test";
import { renderTaskActionTemplate } from "./render-template.js";
import type { TaskActionPromptContext } from "./types.js";
import { findUnknownPlaceholders, UnknownPromptPlaceholderError } from "./validate-template.js";

const baseContext: TaskActionPromptContext = {
  action: {
    id: "plan",
    label: "Plan"
  },
  apiBaseUrl: "http://127.0.0.1:3001",
  sessionId: "session-1",
  taskDescription: "Build the feature",
  taskId: "task-1",
  taskTitle: "Example task"
};

void test("renderTaskActionTemplate substitutes known placeholders", () => {
  const rendered = renderTaskActionTemplate(
    "{{taskHeader}}\n\n{{registerSession}}",
    baseContext
  );

  assert.match(rendered, /^# Example task/);
  assert.match(rendered, /## Description\nBuild the feature/);
  assert.match(rendered, /## Tasker session claim/);
  assert.match(rendered, /\/sessions\/session-1\/claim/);
});

void test("renderTaskActionTemplate leaves worktree empty when disabled", () => {
  const rendered = renderTaskActionTemplate("Before\n{{worktree}}\nAfter", baseContext);

  assert.equal(rendered, "Before\n\nAfter");
});

void test("renderTaskActionTemplate includes worktree when enabled", () => {
  const rendered = renderTaskActionTemplate("{{worktree}}", {
    ...baseContext,
    worktree: {
      enabled: true,
      path: "~/wt/feature"
    }
  });

  assert.match(rendered, /## Worktree/);
  assert.match(rendered, /`~\/wt\/feature`/);
});

void test("renderTaskActionTemplate rejects unknown placeholders", () => {
  assert.throws(
    () => renderTaskActionTemplate("{{unknown}}", baseContext),
    UnknownPromptPlaceholderError
  );
});

void test("findUnknownPlaceholders reports unsupported names", () => {
  assert.deepEqual(findUnknownPlaceholders("{{taskHeader}} {{madeUp}}"), ["madeUp"]);
});
