export type FileChangeType = 'modified' | 'renamed' | 'deleted';

export interface FileChangeEvent {
  readonly path: string;
  readonly type: FileChangeType;
}

export interface FileWatchService {
  watch(path: string, listener: (event: FileChangeEvent) => void): () => void;
  dispose(): void;
}
