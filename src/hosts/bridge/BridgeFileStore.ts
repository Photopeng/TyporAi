import type { DirectoryEntry, FileStat, FileStore } from '@/core/ports';

import type { BridgeClient } from './BridgeClient';

export class BridgeFileStore implements FileStore {
  constructor(private readonly client: BridgeClient) {}

  exists(path: string): Promise<boolean> { return this.client.call('fs.exists', { path }); }
  readText(path: string): Promise<string> { return this.client.call('fs.readText', { path }); }
  writeAtomic(path: string, data: string): Promise<void> { return this.client.call('fs.writeText', { data, path }); }
  writeBinary(path: string, data: Uint8Array): Promise<void> {
    let text = '';
    for (const value of data) text += String.fromCharCode(value);
    return this.client.call('fs.writeBinary', { data: btoa(text), path });
  }
  remove(path: string): Promise<void> { return this.client.call('fs.remove', { path }); }
  list(path: string): Promise<readonly DirectoryEntry[]> { return this.client.call('fs.list', { path }); }
  stat(path: string): Promise<FileStat> { return this.client.call('fs.stat', { path }); }
  rename(from: string, to: string): Promise<void> { return this.client.call('fs.rename', { from, to }); }
  ensureDirectory(path: string): Promise<void> { return this.client.call('fs.mkdir', { path }); }
}
