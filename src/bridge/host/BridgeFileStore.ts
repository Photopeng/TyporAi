import type { DirectoryEntry, FileStat, FileStore } from '@/core/ports';

export interface RpcRequester {
  request<TResult>(method: string, params?: unknown, signal?: AbortSignal): Promise<TResult>;
}

export class BridgeFileStore implements FileStore {
  constructor(private readonly rpc: RpcRequester) {}

  exists(path: string): Promise<boolean> { return this.rpc.request('fs.stat', { path }).then(() => true).catch(() => false); }
  readText(path: string): Promise<string> { return this.rpc.request('fs.readText', { path }); }
  writeAtomic(path: string, data: string): Promise<void> { return this.rpc.request('fs.writeText', { data, idempotencyKey: crypto.randomUUID(), path }); }
  writeBinary(path: string, data: Uint8Array): Promise<void> { return this.rpc.request('fs.writeBinary', { data: bytesToBase64(data), idempotencyKey: crypto.randomUUID(), path }); }
  remove(path: string): Promise<void> { return this.rpc.request('fs.remove', { idempotencyKey: crypto.randomUUID(), path }); }
  list(path: string): Promise<readonly DirectoryEntry[]> { return this.rpc.request('fs.list', { path }); }
  stat(path: string): Promise<FileStat> { return this.rpc.request('fs.stat', { path }); }
  rename(from: string, to: string): Promise<void> { return this.rpc.request('fs.rename', { from, idempotencyKey: crypto.randomUUID(), to }); }
  ensureDirectory(path: string): Promise<void> { return this.rpc.request('fs.createDirectory', { idempotencyKey: crypto.randomUUID(), path }); }
}

function bytesToBase64(value: Uint8Array): string {
  let text = '';
  for (const byte of value) text += String.fromCharCode(byte);
  return btoa(text);
}
