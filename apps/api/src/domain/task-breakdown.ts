import type { Task } from "./task.js";

export type TaskBreakdownItem = {
  readonly dependsOn: readonly string[];
  readonly description: string;
  readonly id: string;
  readonly title: string;
};

export type TaskBreakdown = {
  readonly items: readonly TaskBreakdownItem[];
  readonly schemaVersion: 1;
  readonly summary: string;
  readonly taskId: string;
};

export type TaskBreakdownSourceInput =
  | {
      readonly breakdown: TaskBreakdown;
      readonly uri?: never;
    }
  | {
      readonly breakdown?: never;
      readonly uri: string;
    };

export type TaskBreakdownValidationError = {
  readonly message: string;
  readonly path: string;
};

export type TaskBreakdownWarning =
  | {
      readonly code: "task_has_existing_subtasks";
      readonly existingSubtasks: readonly Task[];
      readonly message: string;
    }
  | {
      readonly code: "dependency_order";
      readonly message: string;
      readonly path: string;
    };

export type TaskBreakdownValidationResult = {
  readonly breakdown: TaskBreakdown | null;
  readonly errors: readonly TaskBreakdownValidationError[];
  readonly previewUrl: string | null;
  readonly valid: boolean;
  readonly warnings: readonly TaskBreakdownWarning[];
};

export type AcceptTaskBreakdownResult = {
  readonly accepted: true;
  readonly createdSubtasks: readonly Task[];
  readonly taskId: string;
};
