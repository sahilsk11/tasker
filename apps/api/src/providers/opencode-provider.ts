import type { HarnessTurn } from "../domain/task-session-turn.js";
import { buildPromptText } from "../prompt-text.js";
import type {
  ProviderTurnContext,
  ProviderTurnResult,
  SendMessageOptions,
  ServerProviderAdapter,
  ServerProviderCapabilities
} from "./types.js";

export type StartOpenCodeSessionInput = {
  readonly cwd: string;
  readonly pendingForkSessionToken: string | null;
  readonly sessionId: string;
  readonly sessionToken: string | null;
};

export type StartOpenCodeTurnInput = {
  readonly content: string;
  readonly model?: string;
  readonly sessionId: string;
};

export type OpenCodeSessionManager = {
  readonly startSession: (
    input: StartOpenCodeSessionInput
  ) => Promise<string | null>;
  readonly startTurn: (input: StartOpenCodeTurnInput) => Promise<HarnessTurn>;
  readonly stopAll: () => void;
  readonly stopSession: (sessionId: string) => void;
};

const OPENCODE_CAPABILITIES = {
  canFork: false,
  drivesTurnViaBackgroundSession: false,
  initialActiveStatus: "starting",
  supportsPlanMode: false
} as const satisfies ServerProviderCapabilities;

export class OpenCodeProviderAdapter implements ServerProviderAdapter {
  public readonly capabilities = OPENCODE_CAPABILITIES;
  public readonly id = "opencode" as const;

  public constructor(private readonly manager: OpenCodeSessionManager) {}

  public resolveSettings(options: SendMessageOptions) {
    const model = normalizeOpenCodeModel(options.model);

    return {
      ...(model == null ? {} : { model }),
      planMode: false
    };
  }

  public async startTurn(
    context: ProviderTurnContext
  ): Promise<ProviderTurnResult> {
    const sessionToken = await this.manager.startSession({
      cwd: context.localPath,
      pendingForkSessionToken: context.pendingForkSessionToken,
      sessionId: context.sessionId,
      sessionToken: context.sessionToken
    });

    if (context.pendingForkSessionToken != null && sessionToken != null) {
      await context.clearPendingForkSessionToken();
    }

    const turn = await this.manager.startTurn({
      content: buildPromptText(context.content, context.attachments),
      ...(context.model == null || context.model.length === 0 ? {} : { model: context.model }),
      sessionId: context.sessionId
    });

    return { turn };
  }

  public stopChat(sessionId: string): void {
    this.manager.stopSession(sessionId);
  }

  public stopSession(sessionId: string): void {
    this.stopChat(sessionId);
  }

  public stopAll(): void {
    this.manager.stopAll();
  }

  public forkNotSupportedMessage(): string {
    return "OpenCode sessions cannot be forked yet";
  }
}

function normalizeOpenCodeModel(model: string | undefined): string | undefined {
  const requested = model?.trim();
  return requested == null || requested.length === 0 || requested === "default"
    ? undefined
    : requested;
}
