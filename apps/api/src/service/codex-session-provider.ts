import type { ClaimTaskSessionInput, TaskSession } from "../domain/task-session.js";
import {
  defaultCodexSessionsRoot,
  resolveCodexTranscriptPath
} from "./codex-transcript.js";
import {
  defaultCodexTitleDiscovery,
  resolveCodexSessionDisplayTitle,
  type CodexSessionTitleDiscovery
} from "./codex-session-title.js";
import type { TaskSessionProvider } from "./session-provider.js";

export type CodexSessionProviderOptions = {
  readonly sessionsRoot?: string;
  readonly titleDiscovery?: CodexSessionTitleDiscovery;
};

export class CodexSessionProvider implements TaskSessionProvider {
  public readonly provider = "codex";

  private readonly sessionsRoot: string;
  private readonly titleDiscovery: CodexSessionTitleDiscovery;

  public constructor(options: CodexSessionProviderOptions = {}) {
    this.sessionsRoot = options.sessionsRoot ?? defaultCodexSessionsRoot();
    this.titleDiscovery = options.titleDiscovery ?? defaultCodexTitleDiscovery();
  }

  public async prepareClaimInput(
    input: ClaimTaskSessionInput
  ): Promise<ClaimTaskSessionInput> {
    if (
      input.provider !== this.provider ||
      input.providerId == null ||
      input.providerId.length === 0 ||
      input.transcriptPath !== undefined
    ) {
      return input;
    }

    const transcriptPath = await resolveCodexTranscriptPath(input.providerId, {
      sessionsRoot: this.sessionsRoot
    });

    return transcriptPath == null ? input : { ...input, transcriptPath };
  }

  public async enrichSession(session: TaskSession): Promise<TaskSession> {
    if (session.providerId == null || session.providerId.length === 0) {
      return session;
    }

    const displayTitle = await resolveCodexSessionDisplayTitle(
      session.providerId,
      this.titleDiscovery
    );

    return { ...session, displayTitle };
  }
}
