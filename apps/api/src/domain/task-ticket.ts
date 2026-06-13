import type { TaskId } from "./task.js";

export type TaskTicketId = string;

export type TaskTicket = {
  readonly createdAt: Date;
  readonly externalId: string;
  readonly id: TaskTicketId;
  readonly taskId: TaskId;
  readonly url: string | null;
};

export type CreateTaskTicketInput = {
  readonly externalId: string;
  readonly url: string | null;
};
