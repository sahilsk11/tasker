import type {
  TaskArtifactId,
  TaskArtifactLabel
} from "./task-artifact.js";
import type { TaskPullRequestId } from "./task-pull-request.js";
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

export type PullRequestRegisteredTaskEvent = {
  readonly type: "pull_request_registered";
  readonly pullRequestId: TaskPullRequestId;
  readonly taskId: TaskId;
  readonly url: string;
};

export type SessionCreatedTaskEvent = {
  readonly type: "session_created";
  readonly actionId: string | null;
  readonly sessionId: TaskSessionId;
  readonly taskId: TaskId;
};

export type SessionClaimedTaskEvent = {
  readonly type: "session_claimed";
  readonly actionId: string | null;
  readonly sessionId: TaskSessionId;
  readonly taskId: TaskId;
};

export type TaskEvent =
  | ArtifactRegisteredTaskEvent
  | PullRequestRegisteredTaskEvent
  | SessionCreatedTaskEvent
  | SessionClaimedTaskEvent;
