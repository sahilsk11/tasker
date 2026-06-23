import type { TaskId } from "./task.js";

export type TaskArtifactId = string;

export type TaskArtifactLabel = "research" | "plan" | "implement" | "other";

export type TaskArtifact = {
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly createdBySessionId: string | null;
  readonly id: TaskArtifactId;
  readonly label: TaskArtifactLabel;
  readonly taskId: TaskId;
  readonly uri: string;
};

export type CreateTaskArtifactInput = {
  readonly createdBySessionId?: string | null;
  readonly label: TaskArtifactLabel;
  readonly uri: string;
};
