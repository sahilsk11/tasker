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
  agentProvider: "codex",
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
  assert.match(rendered, /"provider": "codex"/);
  assert.match(rendered, /CODEX_THREAD_ID/);
  assert.doesNotMatch(rendered, /CLAUDE_CODE_SESSION_ID/);
});

void test("renderTaskActionTemplate renders Claude Code claim instructions", () => {
  const rendered = renderTaskActionTemplate("{{registerSession}}", {
    ...baseContext,
    agentProvider: "claude-code"
  });

  assert.match(rendered, /"provider": "claude-code"/);
  assert.match(rendered, /\$\{CLAUDE_CODE_SESSION_ID:-\}/);
  assert.match(rendered, /claudeCodeSessionIdEnvPresent/);
  assert.match(rendered, /explicit metadata fallback/);
  assert.doesNotMatch(rendered, /CODEX_THREAD_ID/);
});

void test("renderTaskActionTemplate renders Cursor claim instructions", () => {
  const rendered = renderTaskActionTemplate("{{registerSession}}", {
    ...baseContext,
    agentProvider: "cursor"
  });

  assert.match(rendered, /"provider": "cursor"/);
  assert.match(rendered, /\$\{CURSOR_BACKGROUND_AGENT_ID:-\}/);
  assert.match(rendered, /cursorBackgroundAgentIdEnvPresent/);
  assert.match(rendered, /explicit metadata fallback/);
  assert.doesNotMatch(rendered, /CODEX_THREAD_ID/);
  assert.doesNotMatch(rendered, /CLAUDE_CODE_SESSION_ID/);
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

void test("renderTaskActionTemplate supports legacy placeholders", () => {
  const rendered = renderTaskActionTemplate(
    "{{taskHeader}}\n\n{{artifactAttribution}}\n\n{{registerDoc}}\n\n{{worktree}}",
    {
      ...baseContext,
      optionsText: "## Worktree\n\nUse `~/wt/legacy`."
    }
  );

  assert.match(rendered, /^# Example task/);
  assert.match(rendered, /## Description\nBuild the feature/);
  assert.match(rendered, /## Tasker artifact attribution/);
  assert.match(rendered, /\/tasks\/task-1\/artifacts/);
  assert.match(rendered, /## Worktree/);
});

void test("renderTaskActionTemplate uses valid artifact labels in registration sample", () => {
  const rendered = renderTaskActionTemplate("{{registerArtifact}}", baseContext);

  assert.match(rendered, /artifact_label="other"/);
  assert.doesNotMatch(rendered, /artifact_label="scope"/);
});

void test("renderTaskActionTemplate includes actionable breakdown workflow guidance", () => {
  const rendered = renderTaskActionTemplate("{{breakdownWorkflow}}", baseContext);

  assert.match(rendered, /## Tasker breakdown workflow/);
  assert.match(rendered, /"taskId": "task-1"/);
  assert.match(rendered, /stable kebab-case item IDs/);
  assert.match(rendered, /If validation returns errors, revise the JSON and validate again/);
  assert.match(rendered, /give the user the returned `previewUrl`/);
});

void test("renderTaskActionTemplate includes skill opt-out guidance", () => {
  const rendered = renderTaskActionTemplate("{{ignoreSkills}}", baseContext);

  assert.match(rendered, /## Skill usage/);
  assert.match(rendered, /Do not use any skills for this task/);
  assert.match(rendered, /Follow the instructions in this prompt directly/);
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

void test("findUnknownPlaceholders accepts legacy placeholders", () => {
  assert.deepEqual(
    findUnknownPlaceholders(
      "{{taskHeader}} {{artifactAttribution}} {{registerDoc}} {{worktree}}"
    ),
    []
  );
});

void test("findUnknownPlaceholders accepts skill opt-out placeholder", () => {
  assert.deepEqual(findUnknownPlaceholders("{{ignoreSkills}}"), []);
});
