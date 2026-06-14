import type { Generated, Selectable } from "kysely";

export type Database = {
  readonly task_artifacts: TaskArtifactsTable;
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

export type TaskTicketsTable = {
  readonly created_at: Generated<string>;
  readonly external_id: string;
  readonly id: string;
  readonly task_id: string;
  readonly url: string | null;
};

export type TaskArtifactRow = Selectable<TaskArtifactsTable>;
export type TaskRow = Selectable<TasksTable>;
export type TaskTicketRow = Selectable<TaskTicketsTable>;
