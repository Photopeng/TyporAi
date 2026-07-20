import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { WorkspaceGrantStore } from './WorkspaceGrantStore';

export class PersistentWorkspaceGrantStore extends WorkspaceGrantStore {
  private persistQueue: Promise<void> = Promise.resolve();
  private constructor(private readonly filePath: string) { super(); }

  static async open(filePath: string): Promise<PersistentWorkspaceGrantStore> {
    const store = new PersistentWorkspaceGrantStore(filePath);
    try {
      const value = JSON.parse(await readFile(filePath, 'utf8')) as { root?: unknown };
      if (typeof value.root === 'string') store.grant(value.root);
    } catch { /* First launch or corrupted grant state starts ungranted. */ }
    return store;
  }

  async grantAndPersist(root: string): Promise<string> {
    const value = path.resolve(root);
    await this.persistValue(value);
    this.root = value;
    return value;
  }

  async revokeAndPersist(): Promise<void> {
    await this.persistValue(null);
    this.root = null;
  }

  private async persistValue(root: string | null): Promise<void> {
    const operation = this.persistQueue.then(() => this.writeValue(root));
    this.persistQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async writeValue(root: string | null): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ root }), 'utf8');
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
