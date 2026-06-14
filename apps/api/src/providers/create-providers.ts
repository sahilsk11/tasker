import type { AgentProvider } from "../domain/agent-provider.js";
import {
  CodexProviderAdapter,
  type CodexSessionManager
} from "./codex-provider.js";
import { CodexSdkManager } from "./codex-sdk-manager.js";
import {
  OpenCodeProviderAdapter,
  type OpenCodeSessionManager
} from "./opencode-provider.js";
import { ServerProviderRegistry } from "./registry.js";
import type { ProviderHost, ServerProviderAdapter } from "./types.js";

export type CreateServerProvidersArgs = {
  readonly adapters?: Partial<Record<AgentProvider, ServerProviderAdapter>>;
  readonly codexManager?: CodexSessionManager;
  readonly host?: ProviderHost;
  readonly opencodeManager?: OpenCodeSessionManager;
};

export function createServerProviders(
  args: CreateServerProvidersArgs = {}
): ServerProviderRegistry {
  const codexManager = args.codexManager ?? new CodexSdkManager();
  const opencodeManager = args.opencodeManager ?? new UnsupportedOpenCodeManager();
  const entries: Array<readonly [AgentProvider, ServerProviderAdapter]> = [
    ["codex", args.adapters?.codex ?? new CodexProviderAdapter(codexManager)],
    ["opencode", args.adapters?.opencode ?? new OpenCodeProviderAdapter(opencodeManager)]
  ];

  if (args.adapters?.claude != null) {
    entries.push(["claude", args.adapters.claude]);
  }

  if (args.adapters?.cursor != null) {
    entries.push(["cursor", args.adapters.cursor]);
  }

  return new ServerProviderRegistry(entries);
}

export function providerCanForkFromRegistry(
  registry: ServerProviderRegistry,
  provider: AgentProvider
): boolean {
  return registry.require(provider).capabilities.canFork;
}

class UnsupportedOpenCodeManager implements OpenCodeSessionManager {
  public startSession(): Promise<string | null> {
    return Promise.reject(new Error(
      "OpenCode process management is not wired in Tasker yet"
    ));
  }

  public startTurn(): Promise<never> {
    return Promise.reject(new Error(
      "OpenCode turn execution is not wired in Tasker yet"
    ));
  }

  public stopAll(): void {
    return undefined;
  }

  public stopSession(sessionId: string): void {
    void sessionId;
  }
}
