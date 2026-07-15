import type { FileBackup, FileBackupService } from '@/core/ports';

import { electronRequire } from './electronRequire';

interface FsPromises {
  cp(from: string, to: string, options: { recursive: boolean; verbatimSymlinks: boolean }): Promise<void>;
  lstat(path: string): Promise<{ isSymbolicLink(): boolean }>;
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  mkdtemp(prefix: string): Promise<string>;
  readlink(path: string): Promise<string>;
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
  symlink(target: string, path: string): Promise<void>;
}

type Entry =
  | { path: string; existed: false }
  | { path: string; existed: true; backupPath: string }
  | { path: string; existed: true; symlinkTarget: string };

export class ElectronFileBackupService implements FileBackupService {
  async create(paths: readonly string[]): Promise<FileBackup | null> {
    if (paths.length === 0) return null;
    const fs = this.fs();
    const path = this.path();
    const os = electronRequire('os') as { tmpdir(): string };
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'typorai-rewind-'));
    const entries: Entry[] = [];

    try {
      for (const [index, original] of paths.entries()) {
        try {
          const stat = await fs.lstat(original);
          if (stat.isSymbolicLink()) {
            entries.push({ path: original, existed: true, symlinkTarget: await fs.readlink(original) });
          } else {
            const backupPath = path.join(root, String(index));
            await fs.cp(original, backupPath, { recursive: true, verbatimSymlinks: true });
            entries.push({ path: original, existed: true, backupPath });
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') entries.push({ path: original, existed: false });
          else throw error;
        }
      }
    } catch (error) {
      await fs.rm(root, { recursive: true, force: true });
      throw error;
    }

    return {
      restore: async () => {
        const errors: unknown[] = [];
        for (const entry of entries) {
          try {
            await fs.rm(entry.path, { recursive: true, force: true });
            if (!entry.existed) continue;
            await fs.mkdir(path.dirname(entry.path), { recursive: true });
            if ('symlinkTarget' in entry) await fs.symlink(entry.symlinkTarget, entry.path);
            else await fs.cp(entry.backupPath, entry.path, { recursive: true, verbatimSymlinks: true });
          } catch (error) { errors.push(error); }
        }
        if (errors.length > 0) throw new Error(`Failed to restore ${errors.length} file(s) after rewind failure.`);
      },
      cleanup: () => fs.rm(root, { recursive: true, force: true }),
    };
  }

  private fs(): FsPromises { return electronRequire('fs/promises') as FsPromises; }
  private path(): { dirname(path: string): string; join(...parts: string[]): string } {
    return electronRequire('path') as { dirname(path: string): string; join(...parts: string[]): string };
  }
}
