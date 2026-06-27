import type { TaskArtifactLabel } from "./task-artifact.js";
import type { TaskEvent } from "./task-event.js";
import type { TaskState } from "./task.js";

export type TaskWorkflowRuleTrigger =
  | TaskEvent["type"]
  | "manual_action"
  | "session_completed"
  | "step_completed";

export type AdvanceTaskStateEffect = {
  readonly state: TaskState;
  readonly type: "advance_state";
};

export type RegisterRecommendationSignalEffect = {
  readonly signal: string;
  readonly type: "register_recommendation_signal";
};

export type EnqueueNextStepEffect = {
  readonly stepId: string;
  readonly type: "enqueue_next_step";
};

export type TaskWorkflowEffect =
  | AdvanceTaskStateEffect
  | EnqueueNextStepEffect
  | RegisterRecommendationSignalEffect;

export type TaskWorkflowRuleConditions = {
  readonly actionId?: string;
  readonly artifactLabel?: TaskArtifactLabel;
};

export type TaskWorkflowRule = {
  readonly conditions?: TaskWorkflowRuleConditions;
  readonly effect: TaskWorkflowEffect;
  readonly id: string;
  readonly trigger: TaskWorkflowRuleTrigger;
};

export type TaskWorkflowRuleValidationError = {
  readonly message: string;
  readonly ruleId: string;
};

const actionConditionTriggers: ReadonlySet<TaskWorkflowRuleTrigger> = new Set([
  "session_claimed",
  "session_completed",
  "session_created"
]);

export function validateTaskWorkflowRules(
  rules: readonly TaskWorkflowRule[]
): readonly TaskWorkflowRuleValidationError[] {
  const errors: TaskWorkflowRuleValidationError[] = [];
  const ids = new Set<string>();

  for (const rule of rules) {
    if (ids.has(rule.id)) {
      errors.push({
        message: `Workflow rule ${rule.id} has a duplicate id`,
        ruleId: rule.id
      });
    }
    ids.add(rule.id);

    if (
      rule.conditions?.artifactLabel != null &&
      rule.trigger !== "artifact_registered"
    ) {
      errors.push({
        message: "Artifact label conditions only apply to artifact_registered rules",
        ruleId: rule.id
      });
    }

    if (
      rule.conditions?.actionId != null &&
      !actionConditionTriggers.has(rule.trigger)
    ) {
      errors.push({
        message: "Action id conditions only apply to session rules",
        ruleId: rule.id
      });
    }
  }

  return errors;
}

export function requireValidTaskWorkflowRules(
  rules: readonly TaskWorkflowRule[]
): void {
  const errors = validateTaskWorkflowRules(rules);
  if (errors.length === 0) {
    return;
  }

  throw new Error(errors.map((error) => error.message).join("; "));
}

export function ruleMatchesTaskEvent(
  rule: TaskWorkflowRule,
  event: TaskEvent
): boolean {
  if (rule.trigger !== event.type) {
    return false;
  }

  const { conditions } = rule;
  if (conditions?.artifactLabel != null) {
    if (event.type !== "artifact_registered") {
      return false;
    }

    if (event.label !== conditions.artifactLabel) {
      return false;
    }
  }

  if (conditions?.actionId != null) {
    if (!("actionId" in event)) {
      return false;
    }

    if (event.actionId !== conditions.actionId) {
      return false;
    }
  }

  return true;
}
