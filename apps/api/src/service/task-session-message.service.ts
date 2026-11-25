import type { PushSessionMessagesRequest } from "@tasker/core";
import { createHash } from "node:crypto";
import type {
  ListTaskSessionMessagesOptions,
  PreparedTaskSessionMessage,
  PushTaskSessionMessagesResult,
  TaskSessionMessagesHead,
  TaskSessionMessagesPage
} from "../domain/task-session-message.js";
import type { TaskSessionId } from "../domain/task-session.js";
import type { TaskSessionMessageRepository } from "../repository/task-session-message.repository.js";
import type { TaskSessionRepository } from "../repository/task-session.repository.js";
import { NotFoundError, SessionMessageConflictError } from "./errors.js";

export class TaskSessionMessageService {
  public constructor(
    private readonly sessions: TaskSessionRepository,
    private readonly messages: TaskSessionMessageRepository
  ) {}

  public async pushMessages(
    sessionId: TaskSessionId,
    input: PushSessionMessagesRequest
  ): Promise<PushTaskSessionMessagesResult> {
    await this.requireSession(sessionId);

    const dedupedByExternalId = new Map<string, PreparedTaskSessionMessage>();
    const inBatchConflictIds = new Set<string>();
    let inBatchSkipped = 0;

    for (const message of input.messages) {
      const contentHash = hashMessageText(message.text);
      const existing = dedupedByExternalId.get(message.externalId);
      if (existing !== undefined) {
        if (existing.contentHash !== contentHash) {
          inBatchConflictIds.add(message.externalId);
        } else {
          inBatchSkipped += 1;
        }
        continue;
      }

      dedupedByExternalId.set(message.externalId, {
        contentHash,
        externalId: message.externalId,
        occurredAt:
          message.occurredAt == null
            ? null
            : new Date(message.occurredAt).toISOString(),
        ordinal: message.ordinal,
        role: message.role,
        text: message.text
      });
    }

    const result = await this.messages.appendBatch(
      sessionId,
      [...dedupedByExternalId.values()],
      {
        inBatchConflictIds: [...inBatchConflictIds],
        inBatchSkipped
      }
    );

    if (result.kind === "conflict") {
      throw new SessionMessageConflictError(
        sessionId,
        result.conflictingExternalIds
      );
    }

    return {
      inserted: result.inserted,
      skipped: result.skipped,
      total: result.total
    };
  }

  public async getHead(
    sessionId: TaskSessionId
  ): Promise<TaskSessionMessagesHead> {
    await this.requireSession(sessionId);
    return this.messages.getHead(sessionId);
  }

  public async listMessages(
    sessionId: TaskSessionId,
    options: ListTaskSessionMessagesOptions = {}
  ): Promise<TaskSessionMessagesPage> {
    await this.requireSession(sessionId);
    return this.messages.listBySessionId(sessionId, options);
  }

  private async requireSession(sessionId: TaskSessionId): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    if (session == null) {
      throw new NotFoundError(`Task session ${sessionId} not found`);
    }
  }
}

export function hashMessageText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
