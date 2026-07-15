import type { HostServices } from '@/core/ports';

export interface DisposableRuntime { cleanup(): void | Promise<void>; }
export interface RuntimeFactory<T extends DisposableRuntime> { create(host: HostServices): T; }

export class ProviderRuntimeContainer<T extends DisposableRuntime> {
  private readonly runtimes = new Set<T>();
  private disposed = false;
  constructor(private readonly host: HostServices) {}

  create(factory: RuntimeFactory<T>): T {
    if (this.disposed) throw new Error('Provider runtime container is disposed');
    const runtime = factory.create(this.host);
    this.runtimes.add(runtime);
    const cleanup = runtime.cleanup.bind(runtime);
    runtime.cleanup = async (): Promise<void> => {
      if (!this.runtimes.delete(runtime)) return;
      await cleanup();
    };
    return runtime;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const runtime of [...this.runtimes].reverse()) {
      await runtime.cleanup();
    }
    this.runtimes.clear();
  }
}
