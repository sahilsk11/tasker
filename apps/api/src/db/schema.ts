import type { Generated, Selectable } from "kysely";
import type { TaskMemorySearchSourceType } from "@tasker/core";
import type { TaskArtifactLabel } from "../domain/task-artifact.js";
import type { TaskSessionMessageRole } from "../domain/task-session-message.js";

export type Database = {
  readonly task_action_overrides: TaskActionOverridesTable;
  readonly task_artifacts: TaskArtifactsTable;
  readonly task_dependencies: TaskDependenciesTable;
  readonly task_pull_requests: TaskPullRequestsTable;
  readonly task_session_messages: TaskSessionMessagesTable;
  readonly task_sessions: TaskSessionsTable;
  readonly task_memory_search_documents: TaskMemorySearchDocumentsTable;
  readonly task_memory_search_jobs: TaskMemorySearchJobsTable;
  readonly task_tickets: TaskTicketsTable;
  readonly tasks: TasksTable;
  readonly working_path_settings: WorkingPathSettingsTable;
};

export type TaskDependenciesTable = {
  readonly created_at: Generated<string>;
  readonly depends_on_task_id: string;
  readonly task_id: string;
};

export type TasksTable = {
  readonly created_at: Generated<string>;
  readonly description: string | null;
  readonly id: string;
  readonly parent_task_id: string | null;
  readonly title: string;
  readonly updated_at: Generated<string>;
  readonly working_directory: string | null;
};

export type TaskArtifactsTable = {
  readonly archived_at: string | null;
  readonly created_at: Generated<string>;
  readonly created_by_session_id: string | null;
  readonly dedupe_key: string;
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

export type TaskActionOverridesTable = {
  readonly id: string;
  readonly entry_json: string;
  readonly updated_at: string;
};

export type TaskSessionMessagesTable = {
  readonly content_hash: string;
  readonly created_at: Generated<string>;
  readonly external_id: string;
  readonly id: string;
  readonly occurred_at: string | null;
  readonly ordinal: number;
  readonly role: TaskSessionMessageRole;
  readonly session_id: string;
  readonly text: string;
};

export type TaskMemorySearchDocumentsTable = {
  readonly body: string;
  readonly message_id: string | null;
  readonly ordinal: number | null;
  readonly role: TaskSessionMessageRole | null;
  readonly session_id: string | null;
  readonly source_type: TaskMemorySearchSourceType;
  readonly task_id: string;
  readonly title: string;
  readonly vector_id: string;
};

export type TaskMemorySearchJobsTable = {
  readonly attempts: number;
  readonly available_at: string;
  readonly claimed_at: string | null;
  readonly entity_id: string;
  readonly entity_type: "message" | "session" | "task";
  readonly generation_token: string;
  readonly job_key: string;
  readonly last_error: string | null;
  readonly lease_token: string | null;
  readonly next_chunk: number;
  readonly queued_at: string;
  readonly task_id: string;
};

export type TaskSessionsTable = {
  readonly app_name: string | null;
  readonly client_name: string | null;
  readonly display_title: string | null;
  readonly machine_name: string | null;
  readonly source_url: string | null;
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

export type WorkingPathSettingsTable = {
  readonly default_working_directory: string | null;
  readonly default_worktree_path: Generated<string>;
  readonly id: 1;
  readonly updated_at: Generated<string>;
};

export type TaskArtifactRow = Selectable<TaskArtifactsTable>;
export type TaskDependencyRow = Selectable<TaskDependenciesTable>;
export type TaskPullRequestRow = Selectable<TaskPullRequestsTable>;
export type TaskRow = Selectable<TasksTable>;
export type TaskSessionMessageRow = Selectable<TaskSessionMessagesTable>;
export type TaskSessionRow = Selectable<TaskSessionsTable>;
export type TaskTicketRow = Selectable<TaskTicketsTable>;
export type WorkingPathSettingsRow = Selectable<WorkingPathSettingsTable>;
