import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTaskActionPromptValues,
  renderOptionsForPrompt
} from "./task-action-prompt-values.js";

void test("parseTaskActionPromptValues upgrades legacy worktree values", () => {
  const values = parseTaskActionPromptValues({
    worktree: {
      enabled: true,
      path: "~/legacy-wt"
    }
  });

  assert.deepEqual(values, {
    options: {
      worktree: {
        enabled: true,
        fields: {
          path: "~/legacy-wt"
        }
      }
    }
  });
});

void test("renderOptionsForPrompt substitutes hyphenated field placeholders", () => {
  const rendered = renderOptionsForPrompt(
    {
      "custom-option": {
        default: true,
        fields: {
          "text-field": {
            default: "default value",
            type: "text"
          }
        },
        label: "Custom option",
        prompt: {
          enabled: "Field: {{text-field}}"
        },
        type: "boolean"
      }
    },
    {
      options: {
        "custom-option": {
          enabled: true,
          fields: {
            "text-field": "submitted value"
          }
        }
      }
    }
  );

  assert.equal(rendered, "Field: submitted value");
});

void test("renderOptionsForPrompt substitutes context placeholders", () => {
  const rendered = renderOptionsForPrompt(
    {
      worktree: {
        default: true,
        fields: {
          path: {
            default: "/tmp/tasker-wt",
            type: "text"
          }
        },
        label: "Create a worktree",
        prompt: {
          enabled:
            "Path: {{path}} {{apiBaseUrl}}/tasks/{{taskId}}/worktrees {{sessionId}}"
        },
        type: "boolean"
      }
    },
    undefined,
    {
      apiBaseUrl: "http://127.0.0.1:3000",
      sessionId: "session-1",
      taskId: "task-1"
    }
  );

  assert.equal(
    rendered,
    "Path: /tmp/tasker-wt http://127.0.0.1:3000/tasks/task-1/worktrees session-1"
  );
});
