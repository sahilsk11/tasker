import type { TaskId } from "./task.js";

export type TaskArtifactId = string;

export type TaskArtifact = {
  readonly createdAt: Date;
  readonly createdBySessionId: string | null;
  readonly id: TaskArtifactId;
  readonly kind: string;
  readonly label: string;
  readonly taskId: TaskId;
  readonly uri: string;
};

export type CreateTaskArtifactInput = {
  readonly createdBySessionId?: string | null;
  readonly kind: string;
  readonly label: string;
  readonly uri: string;
};
