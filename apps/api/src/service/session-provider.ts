import type {
  ClaimTaskSessionInput,
  SessionProvider,
  TaskSession
} from "../domain/task-session.js";
import type { Task } from "../domain/task.js";
import { BadRequestError } from "./errors.js";

export type StartTaskSessionInput = {
  readonly prompt: string;
  readonly requestedProvider?: SessionProvider | null;
  readonly session: TaskSession;
  readonly task: Task;
  readonly workingPath: string;
};

export type StartedTaskSession = {
  readonly claim: ClaimTaskSessionInput;
  readonly launch: {
    readonly metadata?: Record<string, unknown>;
    readonly openUrl?: string | null;
    readonly provider: SessionProvider;
  };
};

export type TaskSessionProvider = {
  readonly provider: SessionProvider;
  readonly enrichSession?: (session: TaskSession) => Promise<TaskSession>;
  readonly prepareClaimInput?: (
    input: ClaimTaskSessionInput
  ) => Promise<ClaimTaskSessionInput>;
  readonly startSession?: (
    input: StartTaskSessionInput
  ) => Promise<StartedTaskSession>;
};

export class TaskSessionProviderRegistry {
  private readonly providers: ReadonlyMap<SessionProvider, TaskSessionProvider>;
  private readonly defaultLaunchProvider: SessionProvider | null;

  public constructor(
    providers: readonly TaskSessionProvider[] = [],
    options: { readonly defaultLaunchProvider?: SessionProvider | null } = {}
  ) {
    this.providers = new Map(providers.map((provider) => [provider.provider, provider]));
    this.defaultLaunchProvider = options.defaultLaunchProvider ?? null;
  }

  public async prepareClaimInput(
    input: ClaimTaskSessionInput
  ): Promise<ClaimTaskSessionInput> {
    const provider = input.provider == null ? null : this.providers.get(input.provider);
    return provider?.prepareClaimInput == null
      ? input
      : provider.prepareClaimInput(input);
  }

  public async enrichSession(session: TaskSession): Promise<TaskSession> {
    const provider = this.providers.get(session.provider);
    return provider?.enrichSession == null
      ? session
      : provider.enrichSession(session);
  }

  public async enrichSessions(
    sessions: readonly TaskSession[]
  ): Promise<readonly TaskSession[]> {
    return Promise.all(sessions.map((session) => this.enrichSession(session)));
  }

  public async startSession(
    input: StartTaskSessionInput
  ): Promise<StartedTaskSession> {
    const providerName = input.requestedProvider ?? this.defaultLaunchProvider;
    if (providerName == null) {
      throw new BadRequestError("No agent session provider is configured");
    }

    const provider = this.providers.get(providerName);
    if (provider?.startSession == null) {
      throw new BadRequestError(
        `Agent session provider ${providerName} does not support launching sessions`
      );
    }

    return provider.startSession(input);
  }
}
