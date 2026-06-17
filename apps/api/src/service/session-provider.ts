import type {
  ClaimTaskSessionInput,
  SessionProvider,
  TaskSession
} from "../domain/task-session.js";

export type TaskSessionProvider = {
  readonly provider: SessionProvider;
  readonly enrichSession?: (session: TaskSession) => Promise<TaskSession>;
  readonly prepareClaimInput?: (
    input: ClaimTaskSessionInput
  ) => Promise<ClaimTaskSessionInput>;
};

export class TaskSessionProviderRegistry {
  private readonly providers: ReadonlyMap<SessionProvider, TaskSessionProvider>;

  public constructor(providers: readonly TaskSessionProvider[] = []) {
    this.providers = new Map(providers.map((provider) => [provider.provider, provider]));
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
}
