export interface DirectoryEntry {
  readonly name: string;
  readonly path: string;
  readonly kind: 'file' | 'directory' | 'other';
}

export interface FileStat {
  readonly size: number;
  readonly modifiedAtMs: number;
  readonly kind: 'file' | 'directory' | 'other';
}

export interface FileStore {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeAtomic(path: string, data: string): Promise<void>;
  writeBinary(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  list(path: string): Promise<readonly DirectoryEntry[]>;
  stat(path: string): Promise<FileStat>;
  rename(from: string, to: string): Promise<void>;
  ensureDirectory(path: string): Promise<void>;
}
