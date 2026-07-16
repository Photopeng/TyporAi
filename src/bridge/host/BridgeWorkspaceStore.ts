import type { WorkspaceStore } from '@/core/ports';

import type { RpcRequester } from './BridgeFileStore';

/** Workspace persistence is routed to Sidecar; this object never touches disk. */
export class BridgeWorkspaceStore implements WorkspaceStore {
  constructor(readonly root: string, private readonly rpc: RpcRequester) {}

  async readText(relativePath: string): Promise<string | null> {
    try { return await this.rpc.request<string>('fs.readText', { path: relativePath }); } catch { return null; }
  }

  async writeText(relativePath: string, value: string): Promise<void> {
    await this.rpc.request('fs.writeText', { path: relativePath, data: value, idempotencyKey: crypto.randomUUID() });
  }

  async appendText(relativePath: string, value: string): Promise<void> {
    const current = await this.readText(relativePath) ?? '';
    await this.writeText(relativePath, `${current}${value}`);
  }
}
