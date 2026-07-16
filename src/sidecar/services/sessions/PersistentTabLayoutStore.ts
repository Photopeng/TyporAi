import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppTabManagerState } from '@/core/providers/types';

import { SessionRevisionConflictError } from './SessionRepository';

export interface VersionedTabLayout { readonly revision: number; readonly value: AppTabManagerState; }

export class PersistentTabLayoutStore {
  private snapshot: VersionedTabLayout;
  private readonly idempotent = new Map<string, VersionedTabLayout>();

  private constructor(private readonly filePath: string, snapshot: VersionedTabLayout) { this.snapshot = snapshot; }

  static async open(filePath: string): Promise<PersistentTabLayoutStore> {
    try {
      const value = JSON.parse(await readFile(filePath, 'utf8')) as VersionedTabLayout;
      if (!Number.isInteger(value.revision) || !isTabLayout(value.value)) throw new Error('Invalid tab layout.');
      return new PersistentTabLayoutStore(filePath, structuredClone(value));
    } catch { return new PersistentTabLayoutStore(filePath, { revision: 0, value: { activeTabId: null, openTabs: [] } }); }
  }

  get(): VersionedTabLayout { return structuredClone(this.snapshot); }

  async set(value: AppTabManagerState, expectedRevision: number, idempotencyKey: string): Promise<VersionedTabLayout> {
    const existing = this.idempotent.get(idempotencyKey);
    if (existing) return structuredClone(existing);
    if (this.snapshot.revision !== expectedRevision) throw new SessionRevisionConflictError('tab-layout');
    const next = { revision: expectedRevision + 1, value: structuredClone(value) };
    this.snapshot = next;
    this.idempotent.set(idempotencyKey, next);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(next), 'utf8');
    await rename(temporary, this.filePath);
    return structuredClone(next);
  }
}

function isTabLayout(value: unknown): value is AppTabManagerState {
  if (!value || typeof value !== 'object') return false;
  const layout = value as Record<string, unknown>;
  return (layout.activeTabId === null || typeof layout.activeTabId === 'string') && Array.isArray(layout.openTabs);
}
