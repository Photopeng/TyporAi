import type { SettingsStorageAdapter } from '@/adapters/settingsStorage';
import type { FileStore, FileWatchService } from '@/core/ports';
import type { Unsubscribe } from '@/shared/types';

type SettingsBag = Record<string, unknown>;

export class BridgeSettingsStorageAdapter implements SettingsStorageAdapter {
  private readonly subscribers = new Map<string, Set<(value: unknown) => void>>();
  private stopWatch: (() => void) | null = null;

  constructor(
    readonly configPath: string,
    private readonly files: FileStore,
    private readonly watches: FileWatchService,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const bag = await this.readBag();
    return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] as T : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const bag = await this.readBag();
    bag[key] = value;
    await this.files.writeAtomic(this.configPath, JSON.stringify(bag, null, 2));
    this.notify(key, value);
    this.ensureWatch();
  }

  subscribe<T>(key: string, callback: (value: T) => void): Unsubscribe {
    const bucket = this.subscribers.get(key) ?? new Set<(value: unknown) => void>();
    bucket.add(callback as (value: unknown) => void);
    this.subscribers.set(key, bucket);
    this.ensureWatch();
    return () => {
      bucket.delete(callback as (value: unknown) => void);
      if (bucket.size === 0) this.subscribers.delete(key);
      if (this.subscribers.size === 0) this.stopWatching();
    };
  }

  dispose(): void {
    this.stopWatching();
    this.subscribers.clear();
  }

  private ensureWatch(): void {
    if (this.stopWatch || this.subscribers.size === 0) return;
    void this.files.exists(this.configPath).then(exists => {
      if (!exists || this.stopWatch || this.subscribers.size === 0) return;
      this.stopWatch = this.watches.watch(this.configPath, () => { void this.notifyExternalChanges(); });
    }).catch(() => undefined);
  }

  private stopWatching(): void {
    this.stopWatch?.();
    this.stopWatch = null;
  }

  private async notifyExternalChanges(): Promise<void> {
    const bag = await this.readBag();
    for (const [key, callbacks] of this.subscribers) {
      if (!Object.prototype.hasOwnProperty.call(bag, key)) continue;
      for (const callback of callbacks) callback(bag[key]);
    }
  }

  private async readBag(): Promise<SettingsBag> {
    try {
      const parsed = JSON.parse(await this.files.readText(this.configPath)) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as SettingsBag : {};
    } catch {
      return {};
    }
  }

  private notify(key: string, value: unknown): void {
    for (const callback of this.subscribers.get(key) ?? []) callback(value);
  }
}
