import type { KeyValueStore } from '@/core/ports';

import type { RpcRequester } from './BridgeFileStore';

interface SettingsSnapshot { readonly revision: number; readonly value: Record<string, unknown>; }

export class BridgeSettingsStore implements KeyValueStore {
  private snapshot: SettingsSnapshot | null = null;

  constructor(private readonly rpc: RpcRequester) {}

  async get<T>(key: string): Promise<T | null> {
    const snapshot = await this.getSnapshot();
    return Object.prototype.hasOwnProperty.call(snapshot.value, key) ? snapshot.value[key] as T : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const snapshot = await this.getSnapshot();
    this.snapshot = await this.rpc.request<SettingsSnapshot>('settings.applyPatch', {
      expectedRevision: snapshot.revision, idempotencyKey: crypto.randomUUID(), patch: { [key]: value },
    });
  }

  async delete(key: string): Promise<void> {
    const snapshot = await this.getSnapshot();
    this.snapshot = await this.rpc.request<SettingsSnapshot>('settings.applyPatch', {
      expectedRevision: snapshot.revision, idempotencyKey: crypto.randomUUID(), patch: { [key]: null },
    });
  }

  private async getSnapshot(): Promise<SettingsSnapshot> {
    this.snapshot ??= await this.rpc.request<SettingsSnapshot>('settings.getSnapshot');
    return this.snapshot;
  }
}
