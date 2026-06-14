import { randomUUID } from "node:crypto";
import type { ProviderActiveTurnState } from "../domain/provider-adapter.js";
import type { TaskSession, TaskSessionId } from "../domain/task-session.js";
import type { HarnessTurn } from "../domain/task-session-turn.js";
import type {
  ResultEntry,
  TranscriptEntry,
  UserPromptEntry
} from "../domain/transcript-entry.js";
import type { ServerProviderRegistry } from "../providers/registry.js";
import type { TaskSessionRepository } from "../repository/task-session.repository.js";
import type { TaskSessionTranscriptRepository } from "../repository/task-session-transcript.repository.js";
import { BadRequestError, NotFoundError } from "./errors.js";

export type SendTaskSessionMessageInput = {
  readonly content: string;
};

export type SendTaskSessionMessageResult = {
  readonly accepted: true;
  readonly session: TaskSession;
};

type ActiveTurn = ProviderActiveTurnState & {
  readonly sessionId: TaskSessionId;
  readonly turn: HarnessTurn;
};

export class TaskSessionCoordinator {
  private readonly activeTurns = new Map<TaskSessionId, ActiveTurn>();

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
    const settings = adapter.resolveSettings({
      planMode: session.planMode,
      provider: session.provider,
      ...(session.model == null ? {} : { model: session.model })
    });
    const userPromptEntry = timestamped<UserPromptEntry>({
      attachments: [],
      content: input.content,
      kind: "user_prompt"
    });
    await this.appendTranscriptEntry(sessionId, userPromptEntry);

    const started = await this.sessions.recordTurnStarted(sessionId, {
      planMode: settings.planMode,
      status: adapter.capabilities.initialActiveStatus,
      ...(settings.model == null ? {} : { model: settings.model })
    });
    if (started == null) {
      throw new NotFoundError(`Task session ${sessionId} not found`);
    }

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
      await this.recordTurnFailure(sessionId, error);
      throw error;
    }

    const active: ActiveTurn = {
      cancelRecorded: false,
      cancelRequested: false,
      hasFinalResult: false,
      sessionId,
      status: adapter.capabilities.initialActiveStatus,
      turn
    };
    this.activeTurns.set(sessionId, active);
    void this.runTurn(active);

    return { accepted: true, session: started };
  }

  public getActiveTurn(sessionId: TaskSessionId): ProviderActiveTurnState | undefined {
    return this.activeTurns.get(sessionId);
  }

  private async appendTranscriptEntry(
    sessionId: TaskSessionId,
    entry: TranscriptEntry
  ): Promise<void> {
    await this.transcript.append(sessionId, entry);
    await this.sessions.recordTranscriptEntry(sessionId, entry);
  }

  private async recordTurnFailure(
    sessionId: TaskSessionId,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.appendTranscriptEntry(sessionId, makeResultEntry({
      isError: true,
      result: message,
      subtype: "error"
    }));
    await this.sessions.recordTurnFailed(sessionId);
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
          continue;
        }

        await this.appendTranscriptEntry(active.sessionId, event.entry);
        if (event.entry.kind === "system_init") {
          active.status = "running";
          await this.sessions.setRunning(active.sessionId);
        }

        if (event.entry.kind === "result") {
          active.hasFinalResult = true;
          await this.recordResultEntry(active.sessionId, event.entry);
          this.activeTurns.delete(active.sessionId);
        }
      }

      if (!active.hasFinalResult && !active.cancelRequested) {
        await this.recordTurnFailure(
          active.sessionId,
          new Error("Provider stream ended without a result event")
        );
      }
    } catch (error) {
      if (!active.cancelRequested) {
        await this.recordTurnFailure(active.sessionId, error);
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
      return;
    }

    if (entry.subtype === "cancelled") {
      await this.sessions.recordTurnCancelled(sessionId);
      return;
    }

    await this.sessions.recordTurnFinished(sessionId);
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
