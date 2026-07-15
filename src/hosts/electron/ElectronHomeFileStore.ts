import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { HomeFileStore } from '@/core/ports';

export class ElectronHomeFileStore implements HomeFileStore {
  private readonly root: string;

  constructor(root: string = os.homedir()) {
    this.root = root;
  }

  async exists(relativePath: string): Promise<boolean> {
    try { await fs.promises.access(this.resolve(relativePath)); return true; } catch { return false; }
  }

  read(relativePath: string): Promise<string> {
    return fs.promises.readFile(this.resolve(relativePath), 'utf8');
  }

  async write(relativePath: string, value: string): Promise<void> {
    const target = this.resolve(relativePath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, value, 'utf8');
  }

  async delete(relativePath: string): Promise<void> {
    try { await fs.promises.unlink(this.resolve(relativePath)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  async deleteFolder(relativePath: string): Promise<void> {
    try { await fs.promises.rmdir(this.resolve(relativePath)); } catch { /* best effort */ }
  }

  async listFolders(relativePath: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(this.resolve(relativePath), { withFileTypes: true });
      return entries.filter(entry => entry.isDirectory()).map(entry => `${relativePath}/${entry.name}`);
    } catch { return []; }
  }

  async ensureFolder(relativePath: string): Promise<void> {
    await fs.promises.mkdir(this.resolve(relativePath), { recursive: true });
  }

  private resolve(relativePath: string): string {
    return path.join(this.root, relativePath);
  }
}
