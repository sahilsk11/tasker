import type { TaskEvent } from "../domain/task-event.js";
import type { TaskWorkflowRule } from "../domain/task-workflow-rule.js";
import {
  requireValidTaskWorkflowRules,
  ruleMatchesTaskEvent
} from "../domain/task-workflow-rule.js";
import type { TaskRepository } from "../repository/task.repository.js";

type TaskStateEventHandler = (event: TaskEvent) => Promise<void>;

export const defaultTaskStateRules = [
  {
    conditions: { artifactLabel: "research" },
    effect: { state: "scoping", type: "advance_state" },
    id: "artifact-research-advances-scoping",
    trigger: "artifact_registered"
  },
  {
    conditions: { artifactLabel: "plan" },
    effect: { state: "planning", type: "advance_state" },
    id: "artifact-plan-advances-planning",
    trigger: "artifact_registered"
  },
  {
    conditions: { artifactLabel: "implement" },
    effect: { state: "implementation", type: "advance_state" },
    id: "artifact-implement-advances-implementation",
    trigger: "artifact_registered"
  },
  {
    effect: { state: "implementation", type: "advance_state" },
    id: "pull-request-advances-implementation",
    trigger: "pull_request_registered"
  }
] satisfies readonly TaskWorkflowRule[];

export function createTaskStateEventHandler(
  tasks: TaskRepository,
  rules: readonly TaskWorkflowRule[] = defaultTaskStateRules
): TaskStateEventHandler {
  requireValidTaskWorkflowRules(rules);

  return async (event) => {
    for (const rule of rules) {
      if (!ruleMatchesTaskEvent(rule, event)) {
        continue;
      }

      if (rule.effect.type === "advance_state") {
        await tasks.updateStateAtLeast(event.taskId, rule.effect.state);
      }
    }
  };
}
