import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { WorkspaceGrantStore } from './WorkspaceGrantStore';

export class PersistentWorkspaceGrantStore extends WorkspaceGrantStore {
  private constructor(private readonly filePath: string) { super(); }

  static async open(filePath: string): Promise<PersistentWorkspaceGrantStore> {
    const store = new PersistentWorkspaceGrantStore(filePath);
    try {
      const value = JSON.parse(await readFile(filePath, 'utf8')) as { root?: unknown };
      if (typeof value.root === 'string') store.grant(value.root);
    } catch { /* First launch or corrupted grant state starts ungranted. */ }
    return store;
  }

  async grantAndPersist(root: string): Promise<string> { const value = this.grant(root); await this.persist(); return value; }
  async revokeAndPersist(): Promise<void> { this.revoke(); await this.persist(); }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ root: this.current }), 'utf8');
    await rename(temporary, this.filePath);
  }
}
