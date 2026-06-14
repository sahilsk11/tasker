import type { HarnessTurn } from "../domain/task-session-turn.js";
import { buildPromptText } from "../prompt-text.js";
import type {
  ProviderTurnContext,
  ProviderTurnResult,
  SendMessageOptions,
  ServerProviderAdapter,
  ServerProviderCapabilities
} from "./types.js";

export type StartCodexSessionInput = {
  readonly cwd: string;
  readonly effort?: string;
  readonly model: string;
  readonly pendingForkSessionToken: string | null;
  readonly serviceTier?: "fast";
  readonly sessionId: string;
  readonly sessionToken: string | null;
};

export type StartCodexTurnInput = {
  readonly content: string;
  readonly effort?: string;
  readonly model: string;
  readonly onToolRequest: ProviderTurnContext["onToolRequest"];
  readonly planMode: boolean;
  readonly serviceTier?: "fast";
  readonly sessionId: string;
};

export type CodexSessionManager = {
  readonly startSession: (
    input: StartCodexSessionInput
  ) => Promise<string | null>;
  readonly startTurn: (input: StartCodexTurnInput) => Promise<HarnessTurn>;
  readonly stopAll: () => void;
  readonly stopSession: (sessionId: string) => void;
};

const CODEX_CAPABILITIES = {
  canFork: false,
  drivesTurnViaBackgroundSession: false,
  initialActiveStatus: "starting",
  supportsPlanMode: true
} as const satisfies ServerProviderCapabilities;

const DEFAULT_CODEX_MODEL = "gpt-5.5";
const DEFAULT_CODEX_MODEL_OPTIONS = {
  fastMode: false,
  reasoningEffort: "high"
} as const;
const CODEX_MODEL_ALIASES = new Map([
  ["gpt-5-codex", "gpt-5.3-codex"]
]);

export class CodexProviderAdapter implements ServerProviderAdapter {
  public readonly capabilities = CODEX_CAPABILITIES;
  public readonly id = "codex" as const;

  public constructor(private readonly manager: CodexSessionManager) {}

  public resolveSettings(options: SendMessageOptions) {
    const modelOptions = normalizeCodexModelOptions(options);
    const serviceTier = modelOptions.fastMode ? "fast" as const : undefined;

    return {
      effort: modelOptions.reasoningEffort,
      model: normalizeCodexModel(options.model),
      planMode: options.planMode === true,
      ...(serviceTier == null ? {} : { serviceTier })
    };
  }

  public async startTurn(
    context: ProviderTurnContext
  ): Promise<ProviderTurnResult> {
    const sessionInput: StartCodexSessionInput = {
      cwd: context.localPath,
      ...(context.effort == null ? {} : { effort: context.effort }),
      model: context.model ?? DEFAULT_CODEX_MODEL,
      pendingForkSessionToken: context.pendingForkSessionToken,
      sessionId: context.sessionId,
      sessionToken: context.sessionToken,
      ...(context.serviceTier == null ? {} : { serviceTier: context.serviceTier })
    };

    const sessionToken = await this.manager.startSession(sessionInput);

    if (context.pendingForkSessionToken != null && sessionToken != null) {
      await context.clearPendingForkSessionToken();
    }

    const turnInput: StartCodexTurnInput = {
      content: buildPromptText(context.content, context.attachments),
      model: context.model ?? DEFAULT_CODEX_MODEL,
      onToolRequest: context.onToolRequest,
      planMode: context.planMode,
      sessionId: context.sessionId,
      ...(context.effort == null ? {} : { effort: context.effort }),
      ...(context.serviceTier == null ? {} : { serviceTier: context.serviceTier })
    };

    const turn = await this.manager.startTurn(turnInput);

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
    return "Codex SDK sessions cannot be forked yet";
  }

  public onCancelPendingTool(tool: { readonly toolKind: string }) {
    return tool.toolKind === "exit_plan_mode" ? "resolve" as const : "discard" as const;
  }

  public onExitPlanModeResponse(result: unknown) {
    const record = (result ?? {}) as {
      readonly confirmed?: boolean;
      readonly message?: string;
    };

    return record.confirmed === true
      ? {
          content: record.message == null || record.message.length === 0
            ? "Proceed with the approved plan."
            : `Proceed with the approved plan. Additional guidance: ${record.message}`,
          planMode: false
        }
      : {
          content: record.message == null || record.message.length === 0
            ? "Revise the plan using this feedback."
            : `Revise the plan using this feedback: ${record.message}`,
          planMode: true
        };
  }
}

function normalizeCodexModel(model: string | undefined): string {
  const requested = model?.trim();
  if (requested == null || requested.length === 0) {
    return DEFAULT_CODEX_MODEL;
  }

  return CODEX_MODEL_ALIASES.get(requested) ?? requested;
}

function normalizeCodexModelOptions(options: SendMessageOptions): {
  readonly fastMode: boolean;
  readonly reasoningEffort: "minimal" | "low" | "medium" | "high" | "xhigh";
} {
  const reasoningEffort = options.modelOptions?.codex?.reasoningEffort;
  return {
    fastMode: typeof options.modelOptions?.codex?.fastMode === "boolean"
      ? options.modelOptions.codex.fastMode
      : DEFAULT_CODEX_MODEL_OPTIONS.fastMode,
    reasoningEffort: isCodexReasoningEffort(reasoningEffort)
      ? reasoningEffort
      : isCodexReasoningEffort(options.effort)
        ? options.effort
        : DEFAULT_CODEX_MODEL_OPTIONS.reasoningEffort
  };
}

function isCodexReasoningEffort(
  value: unknown
): value is "minimal" | "low" | "medium" | "high" | "xhigh" {
  return value === "minimal"
    || value === "low"
    || value === "medium"
    || value === "high"
    || value === "xhigh";
}
