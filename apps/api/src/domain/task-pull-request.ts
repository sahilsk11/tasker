import type { TaskId } from "./task.js";

export type TaskPullRequestId = string;

export type TaskPullRequest = {
  readonly createdAt: Date;
  readonly id: TaskPullRequestId;
  readonly taskId: TaskId;
  readonly url: string;
};

export type CreateTaskPullRequestInput = {
  readonly url: string;
};
