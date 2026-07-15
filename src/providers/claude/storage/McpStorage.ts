import type { WorkspaceFileAdapter } from '../../../core/storage/WorkspaceFileAdapter';
import type {
  ManagedMcpConfigFile,
  ManagedMcpServer,
  McpServerConfig,
} from '../../../core/types';
import { DEFAULT_MCP_SERVER, isValidMcpServerConfig } from '../../../core/types';

export const MCP_CONFIG_PATH = '.claude/mcp.json';

export class McpStorage {
  constructor(private adapter: WorkspaceFileAdapter) {}

  async load(): Promise<ManagedMcpServer[]> {
    try {
      if (!(await this.adapter.exists(MCP_CONFIG_PATH))) {
        return [];
      }

      const content = await this.adapter.read(MCP_CONFIG_PATH);
      const file = JSON.parse(content) as ManagedMcpConfigFile;

      if (!file.mcpServers || typeof file.mcpServers !== 'object') {
        return [];
      }

      const typoraiMeta = file._typorai?.servers ?? {};
      const servers: ManagedMcpServer[] = [];

      for (const [name, config] of Object.entries(file.mcpServers)) {
        if (!isValidMcpServerConfig(config)) {
          continue;
        }

        const meta = typoraiMeta[name] ?? {};
        const disabledTools = Array.isArray(meta.disabledTools)
          ? meta.disabledTools.filter((tool) => typeof tool === 'string')
          : undefined;
        const normalizedDisabledTools =
          disabledTools && disabledTools.length > 0 ? disabledTools : undefined;

        servers.push({
          name,
          config,
          enabled: meta.enabled ?? DEFAULT_MCP_SERVER.enabled,
          contextSaving: meta.contextSaving ?? DEFAULT_MCP_SERVER.contextSaving,
          disabledTools: normalizedDisabledTools,
          description: meta.description,
        });
      }

      return servers;
    } catch {
      return [];
    }
  }

  async save(servers: ManagedMcpServer[]): Promise<void> {
    const mcpServers: Record<string, McpServerConfig> = {};
    const typoraiServers: Record<
      string,
      { enabled?: boolean; contextSaving?: boolean; disabledTools?: string[]; description?: string }
    > = {};

    for (const server of servers) {
      mcpServers[server.name] = server.config;

      // Only store TyporAi metadata if different from defaults
      const meta: {
        enabled?: boolean;
        contextSaving?: boolean;
        disabledTools?: string[];
        description?: string;
      } = {};

      if (server.enabled !== DEFAULT_MCP_SERVER.enabled) {
        meta.enabled = server.enabled;
      }
      if (server.contextSaving !== DEFAULT_MCP_SERVER.contextSaving) {
        meta.contextSaving = server.contextSaving;
      }
      const normalizedDisabledTools = server.disabledTools
        ?.map((tool) => tool.trim())
        .filter((tool) => tool.length > 0);
      if (normalizedDisabledTools && normalizedDisabledTools.length > 0) {
        meta.disabledTools = normalizedDisabledTools;
      }
      if (server.description) {
        meta.description = server.description;
      }

      if (Object.keys(meta).length > 0) {
        typoraiServers[server.name] = meta;
      }
    }

    let existing: Record<string, unknown> | null = null;
    if (await this.adapter.exists(MCP_CONFIG_PATH)) {
      try {
        const raw = await this.adapter.read(MCP_CONFIG_PATH);
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          existing = parsed as Record<string, unknown>;
        }
      } catch {
        existing = null;
      }
    }

    const file: Record<string, unknown> = existing ? { ...existing } : {};
    file.mcpServers = mcpServers;

    const existingTyporAi =
      existing && typeof existing._typorai === 'object'
        ? (existing._typorai as Record<string, unknown>)
        : null;

    if (Object.keys(typoraiServers).length > 0) {
      file._typorai = { ...(existingTyporAi ?? {}), servers: typoraiServers };
    } else if (existingTyporAi) {
      const rest = { ...existingTyporAi };
      delete rest.servers;
      if (Object.keys(rest).length > 0) {
        file._typorai = rest;
      } else {
        delete file._typorai;
      }
    } else {
      delete file._typorai;
    }

    const content = JSON.stringify(file, null, 2);
    await this.adapter.write(MCP_CONFIG_PATH, content);
  }

  async exists(): Promise<boolean> {
    return this.adapter.exists(MCP_CONFIG_PATH);
  }
}
