import assert from "node:assert/strict";
import test from "node:test";
import { parseTaskActionOptions } from "./task-action-options.js";

void test("parseTaskActionOptions upgrades legacy worktree prompt options", () => {
  const options = parseTaskActionOptions(
    JSON.stringify({
      worktree: {
        default: true,
        fields: {
          path: {
            default: "~/legacy-wt",
            type: "text"
          }
        },
        label: "Create a worktree",
        type: "boolean"
      }
    })
  );

  assert.ok(options?.["worktree"]);
  assert.ok(options["worktree"].prompt);
  assert.equal(options["worktree"].prompt.enabled.includes("## Worktree"), true);
  assert.equal(options["worktree"].prompt.enabled.includes("`{{path}}`"), true);
  assert.equal(
    options["worktree"].prompt.enabled.includes("/tasks/{{taskId}}/worktrees"),
    true
  );
  assert.equal(options["worktree"].prompt.enabled.includes("{{sessionId}}"), true);
});
