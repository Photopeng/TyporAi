import type { DirectoryEntry, FileStat, FileStore } from '@/core/ports';

import { electronRequire } from './electronRequire';

interface FsPromises {
  access(path: string): Promise<void>;
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, data: string | Uint8Array, encoding?: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { force: boolean; recursive: boolean }): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  readdir(path: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>>;
  stat(path: string): Promise<{ size: number; mtimeMs: number; isFile(): boolean; isDirectory(): boolean }>;
}

interface PathModule { dirname(path: string): string; join(...parts: string[]): string; }

export class ElectronFileStore implements FileStore {
  async exists(path: string): Promise<boolean> {
    try { await this.fs().access(path); return true; } catch { return false; }
  }

  readText(path: string): Promise<string> { return this.fs().readFile(path, 'utf8'); }

  async writeAtomic(path: string, data: string): Promise<void> {
    const fs = this.fs();
    const directory = this.path().dirname(path);
    const temporary = this.path().join(directory, `.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.writeFile(temporary, data, 'utf8');
      await fs.rename(temporary, path);
    } catch (error) {
      await fs.rm(temporary, { force: true, recursive: false }).catch(() => undefined);
      throw error;
    }
  }

  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    await this.fs().mkdir(this.path().dirname(path), { recursive: true });
    await this.fs().writeFile(path, data);
  }

  remove(path: string): Promise<void> { return this.fs().rm(path, { force: true, recursive: true }); }

  async list(path: string): Promise<readonly DirectoryEntry[]> {
    const entries = await this.fs().readdir(path, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      path: this.path().join(path, entry.name),
      kind: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other',
    }));
  }

  async stat(path: string): Promise<FileStat> {
    const value = await this.fs().stat(path);
    return { size: value.size, modifiedAtMs: value.mtimeMs, kind: value.isFile() ? 'file' : value.isDirectory() ? 'directory' : 'other' };
  }

  rename(from: string, to: string): Promise<void> { return this.fs().rename(from, to); }

  ensureDirectory(path: string): Promise<void> { return this.fs().mkdir(path, { recursive: true }); }

  private fs(): FsPromises { return electronRequire('fs/promises') as FsPromises; }
  private path(): PathModule { return electronRequire('path') as PathModule; }
}
