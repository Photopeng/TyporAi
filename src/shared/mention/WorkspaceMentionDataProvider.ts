import type { WorkspaceFileEntry } from './types';
import { WorkspaceFileCache, WorkspaceFolderCache } from './WorkspaceMentionCache';

export interface WorkspaceMentionDataProviderOptions {
  onFileLoadError?: () => void;
}

export class WorkspaceMentionDataProvider {
  private fileCache: WorkspaceFileCache;
  private folderCache: WorkspaceFolderCache;
  private hasReportedFileLoadError = false;

  constructor(
    app: ConstructorParameters<typeof WorkspaceFileCache>[0],
    options: WorkspaceMentionDataProviderOptions = {}
  ) {
    this.fileCache = new WorkspaceFileCache(app, {
      onLoadError: () => {
        if (this.hasReportedFileLoadError) return;
        this.hasReportedFileLoadError = true;
        options.onFileLoadError?.();
      },
    });
    this.folderCache = new WorkspaceFolderCache(app);
  }

  initializeInBackground(): void {
    this.fileCache.initializeInBackground();
    this.folderCache.initializeInBackground();
  }

  markFilesDirty(): void {
    this.fileCache.markDirty();
  }

  markFoldersDirty(): void {
    this.folderCache.markDirty();
  }

  getCachedWorkspaceFiles(): WorkspaceFileEntry[] {
    return this.fileCache.getFiles();
  }

  getCachedWorkspaceFolders(): Array<{ name: string; path: string }> {
    return this.folderCache.getFolders().map(folder => ({
      name: folder.name,
      path: folder.path,
    }));
  }

}
