import type { ProviderId } from '@/core/providers/types';

export interface SidecarProviderRuntime {
  dispose?(): void | Promise<void>;
}

export type SidecarProviderFactory<T extends SidecarProviderRuntime = SidecarProviderRuntime> = () => T;

export class SidecarProviderRegistry {
  private readonly factories = new Map<ProviderId, SidecarProviderFactory>();

  register(providerId: ProviderId, factory: SidecarProviderFactory): void {
    if (this.factories.has(providerId)) throw new Error(`Provider already registered: ${providerId}`);
    this.factories.set(providerId, factory);
  }

  create<T extends SidecarProviderRuntime>(providerId: ProviderId): T {
    const factory = this.factories.get(providerId);
    if (!factory) throw new Error(`Provider is not registered in Sidecar: ${providerId}`);
    return factory() as T;
  }

  list(): readonly ProviderId[] { return [...this.factories.keys()]; }
}
