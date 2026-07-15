export interface FileBackup {
  restore(): Promise<void>;
  cleanup(): Promise<void>;
}

/** Host-owned transactional snapshot used before provider-driven file rewinds. */
export interface FileBackupService {
  create(paths: readonly string[]): Promise<FileBackup | null>;
}
