import type { AgentProvider } from "../domain/agent-provider.js";
import type { ServerProviderAdapter } from "./types.js";

export class ServerProviderRegistry {
  private readonly adapters: Map<AgentProvider, ServerProviderAdapter>;

  public constructor(
    adapters: Iterable<readonly [AgentProvider, ServerProviderAdapter]>
  ) {
    this.adapters = new Map(adapters);
  }

  public get(provider: AgentProvider): ServerProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  public require(provider: AgentProvider): ServerProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (adapter == null) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    return adapter;
  }

  public values(): Iterable<ServerProviderAdapter> {
    return this.adapters.values();
  }
}

export function providerCanFork(
  registry: ServerProviderRegistry,
  provider: AgentProvider
): boolean {
  return registry.require(provider).capabilities.canFork;
}
