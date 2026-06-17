import type { TaskActionOptions } from "./task-action-options.js";

export type TaskActionId =
  | "research"
  | "plan"
  | "implement"
  | "breakdown"
  | "code_review";

export type TaskAction = {
  readonly description: string;
  readonly id: TaskActionId;
  readonly isRecommended: boolean;
  readonly label: string;
  readonly options: TaskActionOptions | null;
};

export type TaskActionRecord = {
  readonly createdAt: Date;
  readonly description: string;
  readonly enabled: boolean;
  readonly id: string;
  readonly label: string;
  readonly options: TaskActionOptions | null;
  readonly promptTemplate: string;
  readonly sortOrder: number;
  readonly updatedAt: Date;
};

export type TaskActionPromptContext = {
  readonly action: Pick<TaskAction, "id" | "label">;
  readonly apiBaseUrl: string;
  readonly sessionId: string;
  readonly taskDescription: string | null;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly worktree?: {
    readonly enabled: boolean;
    readonly path: string;
  };
};
