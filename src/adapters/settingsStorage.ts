import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { Unsubscribe } from '../shared/types';

export interface SettingsStorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  subscribe<T>(key: string, callback: (value: T) => void): Unsubscribe;
}

type SettingsBag = Record<string, unknown>;

export interface FileSettingsStorageOptions {
  configPath?: string;
  pollIntervalMs?: number;
}

export class FileSettingsStorageAdapter implements SettingsStorageAdapter {
  readonly configPath: string;
  private readonly pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastMtime = 0;
  private subscribers = new Map<string, Set<(value: unknown) => void>>();

  constructor(options: FileSettingsStorageOptions = {}) {
    this.configPath = options.configPath
      ?? path.join(os.homedir(), '.typora-ai-assistant', 'config.json');
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  async get<T>(key: string): Promise<T | null> {
    const bag = await this.readBag();
    return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] as T : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const bag = await this.readBag();
    bag[key] = value;
    await this.writeBag(bag);
    this.notify(key, value);
  }

  subscribe<T>(key: string, callback: (value: T) => void): Unsubscribe {
    const bucket = this.subscribers.get(key) ?? new Set<(value: unknown) => void>();
    bucket.add(callback as (value: unknown) => void);
    this.subscribers.set(key, bucket);
    this.ensurePolling();

    return () => {
      bucket.delete(callback as (value: unknown) => void);
      if (bucket.size === 0) {
        this.subscribers.delete(key);
      }
      if (this.subscribers.size === 0) {
        this.stopPolling();
      }
    };
  }

  dispose(): void {
    this.stopPolling();
    this.subscribers.clear();
  }

  private async readBag(): Promise<SettingsBag> {
    try {
      const raw = await fs.promises.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as SettingsBag
        : {};
    } catch {
      return {};
    }
  }

  private async writeBag(bag: SettingsBag): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.promises.writeFile(this.configPath, JSON.stringify(bag, null, 2), 'utf8');
    this.lastMtime = await this.readMtime();
  }

  private ensurePolling(): void {
    if (this.pollTimer) return;

    void this.readMtime().then((mtime) => {
      this.lastMtime = mtime;
    });
    this.pollTimer = setInterval(() => {
      void this.pollChanges();
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async pollChanges(): Promise<void> {
    const nextMtime = await this.readMtime();
    if (nextMtime === 0 || nextMtime === this.lastMtime) return;

    this.lastMtime = nextMtime;
    const bag = await this.readBag();
    for (const [key, callbacks] of this.subscribers) {
      if (!Object.prototype.hasOwnProperty.call(bag, key)) continue;
      for (const callback of [...callbacks]) {
        callback(bag[key]);
      }
    }
  }

  private async readMtime(): Promise<number> {
    try {
      return (await fs.promises.stat(this.configPath)).mtimeMs;
    } catch {
      return 0;
    }
  }

  private notify(key: string, value: unknown): void {
    for (const callback of this.subscribers.get(key) ?? []) {
      callback(value);
    }
  }
}
