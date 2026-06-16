import type { Generated, Selectable } from "kysely";
import type { TaskArtifactLabel } from "../domain/task-artifact.js";
import type { TaskState } from "../domain/task.js";

export type Database = {
  readonly task_artifacts: TaskArtifactsTable;
  readonly task_pull_requests: TaskPullRequestsTable;
  readonly task_sessions: TaskSessionsTable;
  readonly task_tickets: TaskTicketsTable;
  readonly tasks: TasksTable;
};

export type TasksTable = {
  readonly created_at: Generated<string>;
  readonly description: string | null;
  readonly id: string;
  readonly parent_task_id: string | null;
  readonly state: Generated<TaskState>;
  readonly title: string;
  readonly updated_at: Generated<string>;
};

export type TaskArtifactsTable = {
  readonly created_at: Generated<string>;
  readonly created_by_session_id: string | null;
  readonly id: string;
  readonly label: TaskArtifactLabel;
  readonly task_id: string;
  readonly uri: string;
};

export type TaskPullRequestsTable = {
  readonly created_at: Generated<string>;
  readonly id: string;
  readonly task_id: string;
  readonly url: string;
};

export type TaskSessionsTable = {
  readonly action_id: string | null;
  readonly claimed_at: string | null;
  readonly created_at: Generated<string>;
  readonly id: string;
  readonly metadata_json: string | null;
  readonly provider: string;
  readonly provider_id: string | null;
  readonly task_id: string;
  readonly transcript_path: string | null;
};

export type TaskTicketsTable = {
  readonly created_at: Generated<string>;
  readonly external_id: string;
  readonly id: string;
  readonly task_id: string;
  readonly url: string | null;
};

export type TaskArtifactRow = Selectable<TaskArtifactsTable>;
export type TaskPullRequestRow = Selectable<TaskPullRequestsTable>;
export type TaskRow = Selectable<TasksTable>;
export type TaskSessionRow = Selectable<TaskSessionsTable>;
export type TaskTicketRow = Selectable<TaskTicketsTable>;
