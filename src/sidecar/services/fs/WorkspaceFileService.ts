import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DirectoryEntry, FileStat } from '@/core/ports';

export class WorkspaceNotGrantedError extends Error {}
export class PathOutsideWorkspaceError extends Error {}
export class FileConflictError extends Error {}

/**
 * The v1 filesystem authority. Renderer paths are accepted only after they
 * have been resolved beneath the currently granted workspace root.
 */
export class WorkspaceFileService {
  constructor(private readonly getWorkspaceRoot: () => string | null) {}

  async readText(inputPath: string): Promise<string> { return readFile(await this.allowedPath(inputPath), 'utf8'); }

  async writeText(inputPath: string, data: string, expectedHash?: string): Promise<void> {
    const target = await this.allowedPath(inputPath, true);
    await this.assertExpectedHash(target, expectedHash);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.${randomUUID()}.tmp`);
    await writeFile(temporary, data, 'utf8');
    await rename(temporary, target);
  }

  async writeBinary(inputPath: string, base64: string, expectedHash?: string): Promise<void> {
    const target = await this.allowedPath(inputPath, true);
    await this.assertExpectedHash(target, expectedHash);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.${randomUUID()}.tmp`);
    await writeFile(temporary, Buffer.from(base64, 'base64'));
    await rename(temporary, target);
  }

  async remove(inputPath: string): Promise<void> { await rm(await this.allowedPath(inputPath), { force: true, recursive: true }); }
  async createDirectory(inputPath: string): Promise<void> { await mkdir(await this.allowedPath(inputPath, true), { recursive: true }); }

  async rename(from: string, to: string): Promise<void> {
    const destination = await this.allowedPath(to, true);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(await this.allowedPath(from), destination);
  }

  async list(inputPath: string): Promise<readonly DirectoryEntry[]> {
    const root = await this.allowedPath(inputPath);
    const entries = await readdir(root, { withFileTypes: true });
    return entries.map(entry => ({ kind: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other', name: entry.name, path: path.join(root, entry.name) }));
  }

  async stat(inputPath: string): Promise<FileStat> {
    const value = await stat(await this.allowedPath(inputPath));
    return { kind: value.isFile() ? 'file' : value.isDirectory() ? 'directory' : 'other', modifiedAtMs: value.mtimeMs, size: value.size };
  }

  async resolveWatchTarget(inputPath: string): Promise<string> { return this.allowedPath(inputPath); }

  private async allowedPath(inputPath: string, allowMissing = false): Promise<string> {
    const root = this.getWorkspaceRoot();
    if (!root) throw new WorkspaceNotGrantedError('No workspace has been granted.');
    const canonicalRoot = await realpath(root);
    const resolved = path.resolve(canonicalRoot, inputPath);
    this.assertInside(canonicalRoot, resolved);
    const target = allowMissing ? await this.resolveExistingParent(resolved) : await realpath(resolved);
    this.assertInside(canonicalRoot, target);
    return resolved;
  }

  private async resolveExistingParent(target: string): Promise<string> {
    let current = target;
    while (true) {
      try { return await realpath(current); } catch {
        const parent = path.dirname(current);
        if (parent === current) throw new PathOutsideWorkspaceError('Unable to resolve target path.');
        current = parent;
      }
    }
  }

  private assertInside(root: string, target: string): void {
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new PathOutsideWorkspaceError('Path is outside the granted workspace.');
  }

  private async assertExpectedHash(target: string, expectedHash?: string): Promise<void> {
    if (!expectedHash) return;
    try {
      const { createHash } = await import('node:crypto');
      const actual = createHash('sha256').update(await readFile(target)).digest('hex');
      if (actual !== expectedHash) throw new FileConflictError('File content changed before write.');
    } catch (error) {
      if (error instanceof FileConflictError) throw error;
      // A missing file is valid when the caller does not expect existing content.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
