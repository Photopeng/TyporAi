import type { ProviderId } from '@/core/providers/types';

export interface SidecarProviderRuntime {
  dispose?(): void | Promise<void>;
}

/** JSON-safe per-turn options passed across the renderer/Sidecar boundary. */
export interface SidecarTurnOptions {
  readonly allowedTools?: readonly string[];
  readonly enabledMcpServers?: readonly string[];
  readonly externalContextPaths?: readonly string[];
  readonly forceColdStart?: boolean;
  readonly mcpMentions?: readonly string[];
  readonly model?: string;
}

export interface SidecarProviderContext {
  readonly providerId: ProviderId;
  readonly runtimeId: string;
}

export type SidecarProviderFactory<T extends SidecarProviderRuntime = SidecarProviderRuntime> = (
  context: SidecarProviderContext,
) => T;

export class SidecarProviderRegistry {
  private readonly factories = new Map<ProviderId, SidecarProviderFactory>();

  register(providerId: ProviderId, factory: SidecarProviderFactory): void {
    if (this.factories.has(providerId)) throw new Error(`Provider already registered: ${providerId}`);
    this.factories.set(providerId, factory);
  }

  create<T extends SidecarProviderRuntime>(providerId: ProviderId, runtimeId = ''): T {
    const factory = this.factories.get(providerId);
    if (!factory) throw new Error(`Provider is not registered in Sidecar: ${providerId}`);
    return factory({ providerId, runtimeId }) as T;
  }

  list(): readonly ProviderId[] { return [...this.factories.keys()]; }
}
