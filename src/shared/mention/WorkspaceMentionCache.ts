import type { WorkspaceFileEntry, WorkspaceFolderEntry } from './types';

interface WorkspaceEntrySource {
  vault: {
    getFiles(): Array<{ name: string; path: string; stat?: { mtime?: number } }>;
    getAllLoadedFiles(): Array<{ name?: string; path?: string }>;
  };
}

export interface WorkspaceFileCacheOptions {
  onLoadError?: (error: unknown) => void;
}

export class WorkspaceFileCache {
  private cachedFiles: WorkspaceFileEntry[] = [];
  private dirty = true;
  private isInitialized = false;

  constructor(
    private app: WorkspaceEntrySource,
    private options: WorkspaceFileCacheOptions = {}
  ) {}

  initializeInBackground(): void {
    if (this.isInitialized) return;

    window.setTimeout(() => {
      this.tryRefreshFiles();
    }, 0);
  }

  markDirty(): void {
    this.dirty = true;
  }

  getFiles(): WorkspaceFileEntry[] {
    if (this.dirty || !this.isInitialized) {
      this.tryRefreshFiles();
    }
    return this.cachedFiles;
  }

  private tryRefreshFiles(): void {
    try {
      this.cachedFiles = this.app.vault.getFiles().map(file => ({
        name: file.name,
        path: file.path,
        mtime: file.stat?.mtime ?? 0,
      }));
      this.dirty = false;
    } catch (error) {
      this.options.onLoadError?.(error);
      // Keep stale cache on failure. If data exists, avoid retrying each call.
      if (this.cachedFiles.length > 0) {
        this.dirty = false;
      }
    } finally {
      this.isInitialized = true;
    }
  }
}

function isVisibleFolder(folder: WorkspaceFolderEntry): boolean {
  const normalizedPath = folder.path
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  if (!normalizedPath) return false;
  return !normalizedPath.split('/').some(segment => segment.startsWith('.'));
}

function isWorkspaceFolderLike(value: unknown): value is WorkspaceFolderEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<WorkspaceFolderEntry>;
  return typeof candidate.path === 'string'
    && typeof candidate.name === 'string'
    && !candidate.path.endsWith('.md');
}

export class WorkspaceFolderCache {
  private cachedFolders: WorkspaceFolderEntry[] = [];
  private dirty = true;
  private isInitialized = false;

  constructor(private app: WorkspaceEntrySource) {}

  initializeInBackground(): void {
    if (this.isInitialized) return;

    window.setTimeout(() => {
      this.tryRefreshFolders();
    }, 0);
  }

  markDirty(): void {
    this.dirty = true;
  }

  getFolders(): WorkspaceFolderEntry[] {
    if (this.dirty || !this.isInitialized) {
      this.tryRefreshFolders();
    }
    return this.cachedFolders;
  }

  private tryRefreshFolders(): void {
    try {
      this.cachedFolders = this.loadFolders();
      this.dirty = false;
    } catch {
      // Keep stale cache on failure. If data exists, avoid retrying each call.
      if (this.cachedFolders.length > 0) {
        this.dirty = false;
      }
    } finally {
      this.isInitialized = true;
    }
  }

  private loadFolders(): WorkspaceFolderEntry[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is WorkspaceFolderEntry => isWorkspaceFolderLike(file) && isVisibleFolder(file));
  }
}
