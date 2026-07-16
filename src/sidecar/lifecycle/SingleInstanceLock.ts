import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

interface LockRecord { readonly pid: number; }

export class SingleInstanceLock {
  private acquired = false;

  constructor(private readonly lockPath: string) {}

  async acquire(): Promise<boolean> {
    await mkdir(path.dirname(this.lockPath), { recursive: true });
    try {
      const handle = await open(this.lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid } satisfies LockRecord));
      await handle.close();
      this.acquired = true;
      return true;
    } catch (error) {
      if (!isExistsError(error) || await this.ownerIsAlive()) return false;
      await rm(this.lockPath, { force: true });
      return this.acquire();
    }
  }

  async release(): Promise<void> {
    if (!this.acquired) return;
    this.acquired = false;
    await rm(this.lockPath, { force: true });
  }

  private async ownerIsAlive(): Promise<boolean> {
    try {
      const record = JSON.parse(await readFile(this.lockPath, 'utf8')) as LockRecord;
      if (!Number.isInteger(record.pid) || record.pid <= 0) return false;
      process.kill(record.pid, 0);
      return true;
    } catch { return false; }
  }
}

function isExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'EEXIST';
}
