import type { TaskEvent } from "../domain/task-event.js";
import type {
  TaskWorkflowEffect,
  TaskWorkflowRule
} from "../domain/task-workflow-rule.js";
import {
  requireValidTaskWorkflowRules,
  ruleMatchesTaskEvent
} from "../domain/task-workflow-rule.js";
import type { TaskActionRepository } from "../repository/task-action.repository.js";
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
  rules: readonly TaskWorkflowRule[] = defaultTaskStateRules,
  actions?: Pick<TaskActionRepository, "listAll">
): TaskStateEventHandler {
  requireValidTaskWorkflowRules(rules);

  return async (event) => {
    const eventRules =
      actions == null ? rules : [...rules, ...(await listActionEffectRules(actions))];

    for (const rule of eventRules) {
      if (!ruleMatchesTaskEvent(rule, event)) {
        continue;
      }

      if (rule.effect.type === "advance_state") {
        await tasks.updateStateAtLeast(event.taskId, rule.effect.state);
      }
    }
  };
}

async function listActionEffectRules(
  actions: Pick<TaskActionRepository, "listAll">
): Promise<readonly TaskWorkflowRule[]> {
  const records = await actions.listAll();
  return records.flatMap((action) =>
    action.effects.map((effect, index) => ({
      conditions: { actionId: action.id },
      effect: toWorkflowEffect(effect),
      id: `action-${action.id}-effect-${String(index)}`,
      trigger: effect.trigger
    }))
  );
}

function toWorkflowEffect(
  effect: TaskWorkflowEffect & { readonly trigger: string }
): TaskWorkflowEffect {
  switch (effect.type) {
    case "advance_state":
      return { state: effect.state, type: effect.type };
    case "enqueue_next_step":
      return { stepId: effect.stepId, type: effect.type };
    case "register_recommendation_signal":
      return { signal: effect.signal, type: effect.type };
  }
}
