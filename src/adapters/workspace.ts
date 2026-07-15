import * as fs from 'node:fs';
import * as path from 'node:path';

import { pathGuard } from '../shared/pathGuard';
import type { FileEntry, Unsubscribe } from '../shared/types';
import type { SettingsStorageAdapter } from './settingsStorage';

export interface WorkspaceAdapter {
  getRoot(): string | null;
  setRoot(rootPath: string): Promise<void>;
  resolvePath(relativePath?: string): Promise<string>;
  detectRoot(currentFilePath: string): Promise<string | null>;
  onRootChanged(callback: (newRoot: string) => void): Unsubscribe;
  listFiles(relativeDir?: string): Promise<FileEntry[]>;
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
}

export interface NodeWorkspaceAdapterOptions {
  markerDirectory?: string;
  rootStorageKey?: string;
}

export interface AdoptRootOptions {
  persist?: boolean;
  ensureMarker?: boolean;
}

export class NodeWorkspaceAdapter implements WorkspaceAdapter {
  private root: string | null = null;
  private readonly markerDirectory: string;
  private readonly rootStorageKey: string;
  private listeners = new Set<(newRoot: string) => void>();

  constructor(
    private readonly settingsStorage: SettingsStorageAdapter,
    options: NodeWorkspaceAdapterOptions = {},
  ) {
    this.markerDirectory = options.markerDirectory ?? '.typora-ai-assistant';
    this.rootStorageKey = options.rootStorageKey ?? 'workspaceRoot';
  }

  getRoot(): string | null {
    return this.root;
  }

  async initialize(): Promise<void> {
    const savedRoot = await this.settingsStorage.get<string>(this.rootStorageKey);
    if (savedRoot) {
      this.root = path.resolve(savedRoot);
    }
  }

  async setRoot(rootPath: string): Promise<void> {
    await this.adoptRoot(rootPath, { persist: true, ensureMarker: true });
  }

  async adoptRoot(rootPath: string, options: AdoptRootOptions = {}): Promise<void> {
    const nextRoot = path.resolve(rootPath);
    if (options.ensureMarker) {
      await fs.promises.mkdir(nextRoot, { recursive: true });
      await fs.promises.mkdir(path.join(nextRoot, this.markerDirectory), { recursive: true });
      await fs.promises.writeFile(path.join(nextRoot, this.markerDirectory, 'root.json'), '{}\n', 'utf8');
    }

    this.root = nextRoot;
    if (options.persist) {
      await this.settingsStorage.set(this.rootStorageKey, nextRoot);
    }
    for (const listener of [...this.listeners]) {
      listener(nextRoot);
    }
  }

  async resolvePath(relativePath = '.'): Promise<string> {
    return await pathGuard.resolve(this.requireRoot(), relativePath);
  }

  async detectRoot(currentFilePath: string): Promise<string | null> {
    if (!currentFilePath) return null;

    let current = path.dirname(path.resolve(currentFilePath));
    for (;;) {
      const marker = path.join(current, this.markerDirectory);
      try {
        const stats = await fs.promises.stat(marker);
        if (stats.isDirectory()) {
          return current;
        }
      } catch {
        // Keep walking upward.
      }

      const parent = path.dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  onRootChanged(callback: (newRoot: string) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async listFiles(relativeDir = '.'): Promise<FileEntry[]> {
    const root = this.requireRoot();
    const dir = await this.resolvePath(relativeDir);
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files: FileEntry[] = [];

    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const stats = await fs.promises.stat(absolute);
      const relativePath = path.relative(root, absolute).replace(/\\/g, '/');
      files.push({
        path: relativePath,
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        mtime: stats.mtimeMs,
        size: stats.size,
      });
    }

    return files;
  }

  async readFile(relativePath: string): Promise<string> {
    const target = await this.resolvePath(relativePath);
    return await fs.promises.readFile(target, 'utf8');
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const target = await this.resolvePath(relativePath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, content, 'utf8');
  }

  private requireRoot(): string {
    if (!this.root) {
      throw new Error('Workspace root has not been set.');
    }
    return this.root;
  }
}
