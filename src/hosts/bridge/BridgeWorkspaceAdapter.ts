import type { SettingsStorageAdapter } from '@/adapters/settingsStorage';
import type { AdoptRootOptions, WorkspaceAdapter } from '@/adapters/workspace';
import type { FileStore, PathService } from '@/core/ports';
import type { FileEntry, Unsubscribe } from '@/shared/types';

export interface BridgeWorkspaceAdapterOptions {
  readonly markerDirectory?: string;
  readonly rootStorageKey?: string;
}

export class BridgeWorkspaceAdapter implements WorkspaceAdapter {
  private readonly listeners = new Set<(newRoot: string) => void>();
  private readonly markerDirectory: string;
  private readonly rootStorageKey: string;
  private root: string | null = null;

  constructor(
    private readonly settings: SettingsStorageAdapter,
    private readonly files: FileStore,
    private readonly paths: PathService,
    options: BridgeWorkspaceAdapterOptions = {},
  ) {
    this.markerDirectory = options.markerDirectory ?? '.typora-ai-assistant';
    this.rootStorageKey = options.rootStorageKey ?? 'workspaceRoot';
  }

  getRoot(): string | null { return this.root; }

  async initialize(): Promise<void> {
    const savedRoot = await this.settings.get<string>(this.rootStorageKey);
    if (savedRoot) this.root = this.paths.normalize(savedRoot);
  }

  setRoot(rootPath: string): Promise<void> { return this.adoptRoot(rootPath, { ensureMarker: true, persist: true }); }

  async adoptRoot(rootPath: string, options: AdoptRootOptions = {}): Promise<void> {
    const nextRoot = this.paths.normalize(rootPath);
    if (!this.paths.isAbsolute(nextRoot)) throw new Error('Workspace root must be an absolute path.');
    if (options.ensureMarker) {
      await this.files.ensureDirectory(nextRoot);
      const markerPath = this.paths.join(nextRoot, this.markerDirectory);
      await this.files.ensureDirectory(markerPath);
      await this.files.writeAtomic(this.paths.join(markerPath, 'root.json'), '{}\n');
    }
    this.root = nextRoot;
    if (options.persist) await this.settings.set(this.rootStorageKey, nextRoot);
    for (const listener of this.listeners) listener(nextRoot);
  }

  async resolvePath(relativePath = '.'): Promise<string> {
    const root = this.requireRoot();
    const resolved = this.paths.normalize(this.paths.join(root, relativePath));
    const relative = this.paths.relative?.(root, resolved);
    if (relative?.startsWith('..') || this.paths.isAbsolute(relative ?? '')) {
      throw new Error(`Workspace path escapes its root: ${relativePath}`);
    }
    return resolved;
  }

  async detectRoot(currentFilePath: string): Promise<string | null> {
    let current = this.paths.dirname(this.paths.normalize(currentFilePath));
    for (;;) {
      if (await this.files.exists(this.paths.join(current, this.markerDirectory))) return current;
      const parent = this.paths.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }

  onRootChanged(callback: (newRoot: string) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async listFiles(relativeDir = '.'): Promise<FileEntry[]> {
    const root = this.requireRoot();
    const directory = await this.resolvePath(relativeDir);
    const entries = await this.files.list(directory);
    return Promise.all(entries.map(async entry => {
      const stats = await this.files.stat(entry.path);
      const relativePath = this.paths.relative?.(root, entry.path)?.replace(/\\/g, '/') ?? entry.name;
      return {
        mtime: stats.modifiedAtMs,
        name: entry.name,
        path: relativePath,
        size: stats.size,
        type: entry.kind === 'directory' ? 'directory' : 'file',
      };
    }));
  }

  async readFile(relativePath: string): Promise<string> { return this.files.readText(await this.resolvePath(relativePath)); }
  async writeFile(relativePath: string, content: string): Promise<void> { return this.files.writeAtomic(await this.resolvePath(relativePath), content); }

  private requireRoot(): string {
    if (!this.root) throw new Error('Workspace root has not been set.');
    return this.root;
  }
}
