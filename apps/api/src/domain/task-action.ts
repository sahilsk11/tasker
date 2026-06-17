import type { TaskActionOptions } from "./task-action-options.js";

export type TaskAction = {
  readonly description: string;
  readonly iconName: string | null;
  readonly id: string;
  readonly label: string;
  readonly options: TaskActionOptions | null;
};

export type TaskActionRecord = TaskAction & {
  readonly createdAt: Date;
  readonly enabled: boolean;
  readonly promptTemplate: string;
  readonly sortOrder: number;
  readonly updatedAt: Date;
};

export type TaskActionDetails = TaskAction & {
  readonly createdAt: string;
  readonly enabled: boolean;
  readonly promptTemplate: string;
  readonly sortOrder: number;
  readonly updatedAt: string;
};

export type UpdateTaskActionInput = {
  readonly description?: string;
  readonly enabled?: boolean;
  readonly iconName?: string | null;
  readonly label?: string;
  readonly options?: TaskActionOptions | null;
  readonly promptTemplate?: string;
  readonly sortOrder?: number;
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
