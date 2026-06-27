import assert from "node:assert/strict";
import test from "node:test";
import type { TaskEvent } from "./task-event.js";
import {
  ruleMatchesTaskEvent,
  validateTaskWorkflowRules,
  type TaskWorkflowRule
} from "./task-workflow-rule.js";

void test("ruleMatchesTaskEvent matches trigger and artifact label conditions", () => {
  const rule: TaskWorkflowRule = {
    conditions: { artifactLabel: "plan" },
    effect: { state: "planning", type: "advance_state" },
    id: "plan-artifact",
    trigger: "artifact_registered"
  };

  assert.equal(ruleMatchesTaskEvent(rule, artifactEvent("plan")), true);
  assert.equal(ruleMatchesTaskEvent(rule, artifactEvent("research")), false);
});

void test("ruleMatchesTaskEvent matches action id conditions on session events", () => {
  const rule: TaskWorkflowRule = {
    conditions: { actionId: "plan" },
    effect: { state: "planning", type: "advance_state" },
    id: "plan-session",
    trigger: "session_created"
  };

  assert.equal(ruleMatchesTaskEvent(rule, sessionEvent("plan")), true);
  assert.equal(ruleMatchesTaskEvent(rule, sessionEvent("implement")), false);
});

void test("validateTaskWorkflowRules rejects impossible condition shapes", () => {
  const errors = validateTaskWorkflowRules([
    {
      conditions: { artifactLabel: "plan" },
      effect: { state: "planning", type: "advance_state" },
      id: "bad-artifact-condition",
      trigger: "pull_request_registered"
    },
    {
      conditions: { actionId: "plan" },
      effect: { state: "planning", type: "advance_state" },
      id: "bad-action-condition",
      trigger: "artifact_registered"
    }
  ]);

  assert.deepEqual(
    errors.map((error) => error.ruleId),
    ["bad-artifact-condition", "bad-action-condition"]
  );
});

void test("validateTaskWorkflowRules rejects duplicate ids", () => {
  const errors = validateTaskWorkflowRules([
    {
      effect: { state: "planning", type: "advance_state" },
      id: "duplicate",
      trigger: "session_created"
    },
    {
      effect: { state: "implementation", type: "advance_state" },
      id: "duplicate",
      trigger: "pull_request_registered"
    }
  ]);

  assert.deepEqual(
    errors.map((error) => error.ruleId),
    ["duplicate"]
  );
});

function artifactEvent(label: "research" | "plan"): TaskEvent {
  return {
    artifactId: `artifact-${label}`,
    createdBySessionId: null,
    label,
    taskId: "task-1",
    type: "artifact_registered",
    uri: `/tmp/${label}.md`
  };
}

function sessionEvent(actionId: string): TaskEvent {
  return {
    actionId,
    sessionId: "session-1",
    taskId: "task-1",
    type: "session_created"
  };
}
