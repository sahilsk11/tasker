import type { Generated, Selectable } from "kysely";

export type Database = {
  readonly task_artifacts: TaskArtifactsTable;
  readonly task_session_transcript_entries: TaskSessionTranscriptEntriesTable;
  readonly task_sessions: TaskSessionsTable;
  readonly task_tickets: TaskTicketsTable;
  readonly tasks: TasksTable;
};

export type TasksTable = {
  readonly created_at: Generated<string>;
  readonly description: string | null;
  readonly id: string;
  readonly parent_task_id: string | null;
  readonly title: string;
  readonly updated_at: Generated<string>;
};

export type TaskArtifactsTable = {
  readonly created_at: Generated<string>;
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly task_id: string;
  readonly uri: string;
};

export type TaskSessionsTable = {
  readonly created_at: Generated<string>;
  readonly id: string;
  readonly last_message_at: string | null;
  readonly last_turn_outcome: string | null;
  readonly local_path: string;
  readonly model: string | null;
  readonly pending_fork_session_token: string | null;
  readonly plan_mode: Generated<number>;
  readonly provider: string;
  readonly session_token: string | null;
  readonly status: string;
  readonly task_id: string;
  readonly title: string;
  readonly updated_at: Generated<string>;
};

export type TaskSessionTranscriptEntriesTable = {
  readonly created_at: number;
  readonly hidden: Generated<number>;
  readonly id: string;
  readonly kind: string;
  readonly message_id: string | null;
  readonly payload_json: string;
  readonly task_session_id: string;
};

export type TaskTicketsTable = {
  readonly created_at: Generated<string>;
  readonly external_id: string;
  readonly id: string;
  readonly task_id: string;
  readonly url: string | null;
};

export type TaskArtifactRow = Selectable<TaskArtifactsTable>;
export type TaskRow = Selectable<TasksTable>;
export type TaskSessionRow = Selectable<TaskSessionsTable>;
export type TaskSessionTranscriptEntryRow =
  Selectable<TaskSessionTranscriptEntriesTable>;
export type TaskTicketRow = Selectable<TaskTicketsTable>;
