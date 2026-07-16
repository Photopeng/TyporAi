import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type SettingsSnapshot, VersionedSettingsStore } from './VersionedSettingsStore';

export class PersistentSettingsStore<T extends Record<string, unknown>> {
  private readonly memory: VersionedSettingsStore<T>;

  private constructor(private readonly filePath: string, initial: T, revision = 0) {
    this.memory = new VersionedSettingsStore(initial, revision);
  }

  static async open<T extends Record<string, unknown>>(filePath: string, fallback: T): Promise<PersistentSettingsStore<T>> {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as SettingsSnapshot<T>;
      if (!Number.isInteger(parsed.revision) || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) throw new Error('Invalid settings snapshot.');
      return new PersistentSettingsStore(filePath, parsed.value, parsed.revision);
    } catch { return new PersistentSettingsStore(filePath, fallback); }
  }

  getSnapshot(): SettingsSnapshot<T> { return this.memory.getSnapshot(); }

  async applyPatch(patch: Partial<T>, expectedRevision: number, idempotencyKey: string): Promise<SettingsSnapshot<T>> {
    const snapshot = this.memory.applyPatch(patch, expectedRevision, idempotencyKey);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.filePath);
    return snapshot;
  }
}
