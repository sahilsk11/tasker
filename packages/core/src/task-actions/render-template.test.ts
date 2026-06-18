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
    "{{taskTitle}}\n\n{{taskDescription}}\n\n{{registerSession}}",
    baseContext
  );

  assert.match(rendered, /^Example task/);
  assert.match(rendered, /Example task\n\nBuild the feature/);
  assert.match(rendered, /## Tasker session claim/);
  assert.match(rendered, /\/sessions\/session-1\/claim/);
});

void test("renderTaskActionTemplate leaves options empty when no option text exists", () => {
  const rendered = renderTaskActionTemplate("Before\n{{options}}\nAfter", baseContext);

  assert.equal(rendered, "Before\n\nAfter");
});

void test("renderTaskActionTemplate includes rendered option text", () => {
  const rendered = renderTaskActionTemplate("{{options}}", {
    ...baseContext,
    optionsText: "## Worktree\n\nUse `~/wt/feature`."
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
  assert.deepEqual(findUnknownPlaceholders("{{taskTitle}} {{madeUp}}"), ["madeUp"]);
});
