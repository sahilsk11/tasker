import type {
  TaskArtifactId,
  TaskArtifactLabel
} from "./task-artifact.js";
import type { TaskSessionId } from "./task-session.js";
import type { TaskId } from "./task.js";

export type ArtifactRegisteredTaskEvent = {
  readonly type: "artifact_registered";
  readonly artifactId: TaskArtifactId;
  readonly createdBySessionId: TaskSessionId | null;
  readonly label: TaskArtifactLabel;
  readonly taskId: TaskId;
  readonly uri: string;
};

export type TaskEvent = ArtifactRegisteredTaskEvent;
