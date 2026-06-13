import type { TaskId } from "./task.js";

export type TaskArtifactId = string;

export type TaskArtifact = {
  readonly createdAt: Date;
  readonly id: TaskArtifactId;
  readonly kind: string;
  readonly label: string;
  readonly taskId: TaskId;
  readonly uri: string;
};
