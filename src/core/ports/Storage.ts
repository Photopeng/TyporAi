export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface WorkspaceStore {
  readonly root: string;
  readText(relativePath: string): Promise<string | null>;
  writeText(relativePath: string, value: string): Promise<void>;
  appendText(relativePath: string, value: string): Promise<void>;
}

export interface HomeFileStore {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, value: string): Promise<void>;
  delete(path: string): Promise<void>;
  deleteFolder(path: string): Promise<void>;
  listFolders(path: string): Promise<string[]>;
  ensureFolder(path: string): Promise<void>;
}
