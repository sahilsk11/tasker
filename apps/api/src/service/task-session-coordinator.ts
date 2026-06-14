import { randomUUID } from "node:crypto";
import type { ProviderActiveTurnState } from "../domain/provider-adapter.js";
import type { TaskSession, TaskSessionId } from "../domain/task-session.js";
import type { HarnessTurn } from "../domain/task-session-turn.js";
import type {
  InterruptedEntry,
  ResultEntry,
  TranscriptEntry,
  UserPromptEntry
} from "../domain/transcript-entry.js";
import type { ServerProviderRegistry } from "../providers/registry.js";
import type { TaskSessionRepository } from "../repository/task-session.repository.js";
import type { TaskSessionTranscriptRepository } from "../repository/task-session-transcript.repository.js";
import { AsyncQueue } from "./async-queue.js";
import { BadRequestError, NotFoundError } from "./errors.js";

export type SendTaskSessionMessageInput = {
  readonly content: string;
};

export type SendTaskSessionMessageResult = {
  readonly accepted: true;
  readonly session: TaskSession;
};

export type CancelTaskSessionTurnResult = {
  readonly accepted: true;
};

export type TaskSessionStreamEvent =
  | {
      readonly entry: TranscriptEntry;
      readonly sessionId: TaskSessionId;
      readonly type: "transcript_entry";
    }
  | {
      readonly sessionId: TaskSessionId;
      readonly sessionToken: string;
      readonly type: "session_token";
    }
  | {
      readonly sessionId: TaskSessionId;
      readonly turnId: string;
      readonly type: "turn_started";
    }
  | {
      readonly outcome: ResultEntry["subtype"];
      readonly sessionId: TaskSessionId;
      readonly turnId: string;
      readonly type: "turn_finished";
    }
  | {
      readonly message: string;
      readonly sessionId: TaskSessionId;
      readonly turnId?: string;
      readonly type: "turn_failed";
    };

export type TaskSessionStreamSubscription = {
  readonly close: () => void;
  readonly events: AsyncIterable<TaskSessionStreamEvent>;
};

type ActiveTurn = ProviderActiveTurnState & {
  nextSequence: number;
  readonly sessionId: TaskSessionId;
  readonly turn: HarnessTurn;
  readonly turnId: string;
};

type TurnRuntimeMetadata = {
  nextSequence: number;
  readonly turnId: string;
};

export class TaskSessionCoordinator {
  private readonly activeTurns = new Map<TaskSessionId, ActiveTurn>();
  private readonly subscribers = new Map<
    TaskSessionId,
    Set<AsyncQueue<TaskSessionStreamEvent>>
  >();

  public constructor(
    private readonly sessions: TaskSessionRepository,
    private readonly transcript: TaskSessionTranscriptRepository,
    private readonly providers: ServerProviderRegistry
  ) {}

  public async sendMessage(
    sessionId: TaskSessionId,
    input: SendTaskSessionMessageInput
  ): Promise<SendTaskSessionMessageResult> {
    const session = await this.requireSession(sessionId);
    if (this.activeTurns.has(sessionId) || isActiveStatus(session.status)) {
      throw new BadRequestError("Task session is already running");
    }

    const adapter = this.providers.require(session.provider);
    const turnMetadata: TurnRuntimeMetadata = {
      nextSequence: 1,
      turnId: randomUUID()
    };
    const settings = adapter.resolveSettings({
      planMode: session.planMode,
      provider: session.provider,
      ...(session.model == null ? {} : { model: session.model })
    });
    const userPromptEntry = withTurnMetadata(timestamped<UserPromptEntry>({
      attachments: [],
      content: input.content,
      kind: "user_prompt"
    }), turnMetadata);
    await this.appendTranscriptEntry(sessionId, userPromptEntry);

    const started = await this.sessions.recordTurnStarted(sessionId, {
      planMode: settings.planMode,
      status: adapter.capabilities.initialActiveStatus,
      ...(settings.model == null ? {} : { model: settings.model })
    });
    if (started == null) {
      throw new NotFoundError(`Task session ${sessionId} not found`);
    }
    this.publish(sessionId, {
      sessionId,
      turnId: turnMetadata.turnId,
      type: "turn_started"
    });

    let turn: HarnessTurn;
    try {
      const result = await adapter.startTurn({
        attachments: [],
        clearPendingForkSessionToken: async () => {
          await this.sessions.clearPendingForkSessionToken(sessionId);
        },
        content: input.content,
        localPath: session.localPath,
        onToolRequest: () => Promise.reject(
          new BadRequestError("Tool requests are not supported by Tasker sessions yet")
        ),
        pendingForkSessionToken: session.pendingForkSessionToken,
        planMode: settings.planMode,
        sessionId,
        sessionToken: session.sessionToken,
        ...(settings.effort == null ? {} : { effort: settings.effort }),
        ...(settings.model == null ? {} : { model: settings.model }),
        ...(settings.serviceTier == null ? {} : { serviceTier: settings.serviceTier })
      });
      turn = result.turn;
      if (result.activate != null) {
        await result.activate({
          sessionId,
          setClaudePromptSeq: () => undefined
        });
      }
    } catch (error) {
      await this.recordTurnFailure(sessionId, error, turnMetadata);
      throw error;
    }

    const active: ActiveTurn = {
      cancelRecorded: false,
      cancelRequested: false,
      hasFinalResult: false,
      nextSequence: turnMetadata.nextSequence,
      sessionId,
      status: adapter.capabilities.initialActiveStatus,
      turn,
      turnId: turnMetadata.turnId
    };
    this.activeTurns.set(sessionId, active);
    void this.runTurn(active);

    return { accepted: true, session: started };
  }

  public getActiveTurn(sessionId: TaskSessionId): ProviderActiveTurnState | undefined {
    return this.activeTurns.get(sessionId);
  }

  public async cancelTurn(sessionId: TaskSessionId): Promise<CancelTaskSessionTurnResult> {
    await this.requireSession(sessionId);
    const active = this.activeTurns.get(sessionId);
    if (active == null) {
      throw new BadRequestError("Task session is not running");
    }

    active.cancelRequested = true;
    active.cancelReason = "user_cancelled";
    active.cancelDetail = "Cancelled by user";
    await this.appendTranscriptEntry(
      sessionId,
      withTurnMetadata(timestamped<InterruptedEntry>({
        detail: active.cancelDetail,
        kind: "interrupted",
        reason: active.cancelReason
      }), active)
    );
    await active.turn.interrupt();

    return { accepted: true };
  }

  public subscribe(sessionId: TaskSessionId): TaskSessionStreamSubscription {
    const queue = new AsyncQueue<TaskSessionStreamEvent>();
    const subscribers = this.subscribers.get(sessionId) ?? new Set();
    subscribers.add(queue);
    this.subscribers.set(sessionId, subscribers);

    return {
      close: () => {
        queue.close();
        subscribers.delete(queue);
        if (subscribers.size === 0) {
          this.subscribers.delete(sessionId);
        }
      },
      events: queue
    };
  }

  private async appendTranscriptEntry(
    sessionId: TaskSessionId,
    entry: TranscriptEntry
  ): Promise<void> {
    await this.transcript.append(sessionId, entry);
    await this.sessions.recordTranscriptEntry(sessionId, entry);
    this.publish(sessionId, {
      entry,
      sessionId,
      type: "transcript_entry"
    });
  }

  private async recordTurnFailure(
    sessionId: TaskSessionId,
    error: unknown,
    metadata?: TurnRuntimeMetadata
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const resultEntry = makeResultEntry({
      isError: true,
      result: message,
      subtype: "error"
    });
    await this.appendTranscriptEntry(
      sessionId,
      metadata == null ? resultEntry : withTurnMetadata(resultEntry, metadata)
    );
    await this.sessions.recordTurnFailed(sessionId);
    this.publish(sessionId, {
      message,
      sessionId,
      ...(metadata == null ? {} : { turnId: metadata.turnId }),
      type: "turn_failed"
    });
  }

  private async requireSession(sessionId: TaskSessionId): Promise<TaskSession> {
    const session = await this.sessions.findById(sessionId);
    if (session == null) {
      throw new NotFoundError(`Task session ${sessionId} not found`);
    }

    return session;
  }

  private async runTurn(active: ActiveTurn): Promise<void> {
    try {
      for await (const event of active.turn.stream) {
        if (event.type === "session_token") {
          await this.sessions.setSessionToken(active.sessionId, event.sessionToken);
          this.publish(active.sessionId, {
            sessionId: active.sessionId,
            sessionToken: event.sessionToken,
            type: "session_token"
          });
          continue;
        }

        const entry = withTurnMetadata(event.entry, active);
        await this.appendTranscriptEntry(active.sessionId, entry);
        if (entry.kind === "system_init") {
          active.status = "running";
          await this.sessions.setRunning(active.sessionId);
        }

        if (entry.kind === "result") {
          active.hasFinalResult = true;
          await this.recordResultEntry(active.sessionId, entry);
          this.activeTurns.delete(active.sessionId);
        }
      }

      if (!active.hasFinalResult && !active.cancelRequested) {
        await this.recordTurnFailure(
          active.sessionId,
          new Error("Provider stream ended without a result event"),
          active
        );
      }
    } catch (error) {
      if (!active.cancelRequested) {
        await this.recordTurnFailure(active.sessionId, error, active);
      }
    } finally {
      active.turn.close();
      if (this.activeTurns.get(active.sessionId) === active) {
        this.activeTurns.delete(active.sessionId);
      }
    }
  }

  private async recordResultEntry(
    sessionId: TaskSessionId,
    entry: ResultEntry
  ): Promise<void> {
    if (entry.isError) {
      await this.sessions.recordTurnFailed(sessionId);
    } else if (entry.subtype === "cancelled") {
      await this.sessions.recordTurnCancelled(sessionId);
    } else {
      await this.sessions.recordTurnFinished(sessionId);
    }

    if (entry.turnId != null) {
      this.publish(sessionId, {
        outcome: entry.subtype,
        sessionId,
        turnId: entry.turnId,
        type: "turn_finished"
      });
    }
  }

  private publish(sessionId: TaskSessionId, event: TaskSessionStreamEvent): void {
    const subscribers = this.subscribers.get(sessionId);
    if (subscribers == null) {
      return;
    }

    for (const subscriber of subscribers) {
      subscriber.push(event);
    }
  }
}

function isActiveStatus(status: TaskSession["status"]): boolean {
  return status === "running" || status === "starting" || status === "waiting_for_user";
}

function timestamped<TEntry extends TranscriptEntry>(
  entry: Omit<TEntry, "_id" | "createdAt">
): TEntry {
  return {
    _id: randomUUID(),
    createdAt: Date.now(),
    ...entry
  } as TEntry;
}

function makeResultEntry(
  entry: Pick<ResultEntry, "isError" | "result" | "subtype">
): ResultEntry {
  return timestamped<ResultEntry>({
    durationMs: 0,
    kind: "result",
    ...entry
  });
}

function withTurnMetadata<TEntry extends TranscriptEntry>(
  entry: TEntry,
  metadata: TurnRuntimeMetadata
): TEntry {
  const sequence = entry.sequence ?? metadata.nextSequence;
  if (entry.sequence == null) {
    metadata.nextSequence += 1;
  }

  return {
    ...entry,
    display: entry.display ?? defaultDisplay(entry),
    itemId: entry.itemId ?? inferItemId(entry),
    lifecycle: entry.lifecycle ?? defaultLifecycle(entry),
    sequence,
    turnId: entry.turnId ?? metadata.turnId
  };
}

function defaultDisplay(entry: TranscriptEntry) {
  return entry.kind === "reasoning" ? "collapsed" as const : undefined;
}

function defaultLifecycle(entry: TranscriptEntry) {
  switch (entry.kind) {
    case "tool_call":
      return "started" as const;
    case "tool_result":
    case "result":
      return "completed" as const;
    default:
      return undefined;
  }
}

function inferItemId(entry: TranscriptEntry): string | undefined {
  switch (entry.kind) {
    case "tool_call":
      return entry.tool.toolId;
    case "tool_result":
      return entry.toolId;
    default:
      return undefined;
  }
}
