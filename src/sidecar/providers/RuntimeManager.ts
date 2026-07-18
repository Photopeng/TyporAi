import type { ProviderId } from '@/core/providers/types';

import type { SidecarProviderRegistry} from './registry';
import {type SidecarProviderRuntime } from './registry';

export class RuntimeManager {
  private readonly runtimes = new Map<string, SidecarProviderRuntime>();

  constructor(private readonly providers: SidecarProviderRegistry) {}

  getOrCreate<T extends SidecarProviderRuntime>(providerId: ProviderId, sessionId: string): T {
    const key = `${providerId}:${sessionId}`;
    const existing = this.runtimes.get(key);
    if (existing) return existing as T;
    const runtime = this.providers.create<T>(providerId, sessionId);
    this.runtimes.set(key, runtime);
    return runtime;
  }

  async dispose(providerId: ProviderId, sessionId: string): Promise<void> {
    const key = `${providerId}:${sessionId}`;
    const runtime = this.runtimes.get(key);
    if (!runtime) return;
    this.runtimes.delete(key);
    await runtime.dispose?.();
  }

  async disposeAll(): Promise<void> {
    const entries = [...this.runtimes.entries()];
    this.runtimes.clear();
    await Promise.all(entries.map(([, runtime]) => runtime.dispose?.()));
  }
}
