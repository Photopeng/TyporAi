import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_MCP_SERVER, isValidMcpServerConfig, type ManagedMcpServer } from '@/core/types';

export class PersistentMcpStore {
  private servers: ManagedMcpServer[] = [];
  private persistQueue: Promise<void> = Promise.resolve();
  private constructor(private readonly filePath: string) {}

  static async open(filePath: string): Promise<PersistentMcpStore> {
    const store = new PersistentMcpStore(filePath);
    try { store.servers = store.validate(JSON.parse(await readFile(filePath, 'utf8'))); } catch { store.servers = []; }
    return store;
  }

  list(): readonly ManagedMcpServer[] { return this.servers.map(server => ({ ...server, config: { ...server.config }, disabledTools: server.disabledTools ? [...server.disabledTools] : undefined })); }

  async save(next: readonly ManagedMcpServer[]): Promise<readonly ManagedMcpServer[]> {
    const validated = this.validate(next);
    const operation = this.persistQueue.then(async () => {
      await this.writeServers(validated);
      this.servers = validated;
      return this.list();
    });
    this.persistQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async writeServers(servers: readonly ManagedMcpServer[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(servers, null, 2), 'utf8');
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private validate(value: unknown): ManagedMcpServer[] {
    if (!Array.isArray(value)) return [];
    const names = new Set<string>();
    return value.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const server = item as Partial<ManagedMcpServer>;
      if (typeof server.name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(server.name) || names.has(server.name) || !isValidMcpServerConfig(server.config)) return [];
      names.add(server.name);
      return [{ name: server.name, config: server.config, enabled: server.enabled ?? DEFAULT_MCP_SERVER.enabled, contextSaving: server.contextSaving ?? DEFAULT_MCP_SERVER.contextSaving, disabledTools: Array.isArray(server.disabledTools) ? server.disabledTools.filter(value => typeof value === 'string') : undefined, description: typeof server.description === 'string' ? server.description : undefined }];
    });
  }
}
