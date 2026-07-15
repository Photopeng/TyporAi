export interface DisposableProviderService {
  dispose(): Promise<void> | void;
}

export class ProviderServiceContainer {
  private readonly services = new Map<string, DisposableProviderService>();
  private disposed = false;

  getOrCreate<T extends DisposableProviderService>(key: string, factory: () => T): T {
    if (this.disposed) throw new Error('Provider service container is disposed');
    const existing = this.services.get(key);
    if (existing) return existing as T;
    const service = factory();
    this.services.set(key, service);
    return service;
  }

  get<T extends DisposableProviderService>(key: string): T | null {
    return (this.services.get(key) as T | undefined) ?? null;
  }

  register<T extends DisposableProviderService>(key: string, service: T): T {
    if (this.disposed) throw new Error('Provider service container is disposed');
    const existing = this.services.get(key);
    if (existing) return existing as T;
    this.services.set(key, service);
    return service;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const services = [...this.services.values()].reverse();
    this.services.clear();
    const errors: unknown[] = [];
    for (const service of services) {
      try { await service.dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'One or more provider services failed to dispose');
    }
  }
}
