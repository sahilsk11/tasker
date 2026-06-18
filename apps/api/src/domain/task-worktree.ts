import type { TaskId } from "./task.js";

export type TaskWorktreeId = string;

export type TaskWorktree = {
  readonly createdAt: Date;
  readonly createdBySessionId: string | null;
  readonly id: TaskWorktreeId;
  readonly path: string;
  readonly taskId: TaskId;
};

export type CreateTaskWorktreeInput = {
  readonly createdBySessionId?: string | null;
  readonly path: string;
};
