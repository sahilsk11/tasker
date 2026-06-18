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
