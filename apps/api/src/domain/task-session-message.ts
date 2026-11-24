import type { SessionMessage } from "@tasker/core";
import type { TaskSessionId } from "./task-session.js";

export type TaskSessionMessageId = string;

export type TaskSessionMessageRole = SessionMessage["role"];

export type TaskSessionMessage = {
  readonly contentHash: string;
  readonly createdAt: Date;
  readonly externalId: string;
  readonly id: TaskSessionMessageId;
  readonly occurredAt: Date | null;
  readonly ordinal: number;
  readonly role: TaskSessionMessageRole;
  readonly sessionId: TaskSessionId;
  readonly text: string;
};

export type PreparedTaskSessionMessage = {
  readonly contentHash: string;
  readonly externalId: string;
  readonly occurredAt: string | null;
  readonly ordinal: number;
  readonly role: TaskSessionMessageRole;
  readonly text: string;
};

export type PushTaskSessionMessagesResult = {
  readonly inserted: number;
  readonly skipped: number;
  readonly total: number;
};

export type TaskSessionMessagesHead = {
  readonly count: number;
  readonly lastExternalId: string | null;
  readonly lastOrdinal: number | null;
};

export type ListTaskSessionMessagesOptions = {
  readonly after?: number;
  readonly limit?: number;
};

export type TaskSessionMessagesPage = {
  readonly messages: readonly TaskSessionMessage[];
  readonly nextAfter: number | null;
};
