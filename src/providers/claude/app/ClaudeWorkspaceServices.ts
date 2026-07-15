import { McpServerManager } from '../../../core/mcp/McpServerManager';
import type { HostServices, ProcessTransportFactory } from '../../../core/ports';
import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type {
  AppAgentManager,
  AppAgentStorage,
  AppMcpStorage,
  AppPluginManager,
  ProviderCliResolver,
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import type { WorkspaceFileAdapter } from '../../../core/storage/WorkspaceFileAdapter';
import type TyporAiPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { AgentManager } from '../agents/AgentManager';
import { ClaudeCommandCatalog } from '../commands/ClaudeCommandCatalog';
import { probeRuntimeCommands } from '../commands/probeRuntimeCommands';
import { PluginManager } from '../plugins/PluginManager';
import { claudeConversationHistoryService } from '../registration';
import { ClaudeCliResolver } from '../runtime/ClaudeCliResolver';
import { StorageService } from '../storage/StorageService';
import { claudeSettingsTabRenderer } from '../ui/ClaudeSettingsTab';

export interface ClaudeWorkspaceServices extends ProviderWorkspaceServices {
  claudeStorage: StorageService;
  cliResolver: ProviderCliResolver;
  mcpStorage: AppMcpStorage;
  mcpManager: McpServerManager;
  pluginManager: AppPluginManager;
  agentStorage: AppAgentStorage;
  agentManager: AppAgentManager;
  commandCatalog: ProviderCommandCatalog;
  agentMentionProvider: AppAgentManager;
}

export async function createClaudeWorkspaceServices(
  plugin: TyporAiPlugin,
  adapter: WorkspaceFileAdapter,
): Promise<ClaudeWorkspaceServices> {
  let processTransport: ProcessTransportFactory | undefined;
  const claudeStorage = new StorageService(plugin, adapter);
  await claudeStorage.ensureDirectories();

  const cliResolver = new ClaudeCliResolver();
  const mcpStorage = claudeStorage.mcp;
  const mcpManager = new McpServerManager(mcpStorage);
  await mcpManager.loadServers();

  const vaultPath = getVaultPath(plugin.app) ?? '';
  const pluginManager = new PluginManager(vaultPath, claudeStorage.ccSettings);

  const agentStorage = claudeStorage.agents;
  const agentManager = new AgentManager(vaultPath, pluginManager);

  const commandCatalog = new ClaudeCommandCatalog(
    claudeStorage.commands,
    claudeStorage.skills,
    () => probeRuntimeCommands(plugin, processTransport),
  );

  return {
    claudeStorage,
    cliResolver,
    mcpStorage,
    mcpServerManager: mcpManager,
    mcpManager,
    pluginManager,
    agentStorage,
    agentManager,
    commandCatalog,
    agentMentionProvider: agentManager,
    settingsTabRenderer: claudeSettingsTabRenderer,
    configureHostServices: (host: HostServices) => {
      processTransport = host.processes;
      cliResolver.setFileProbe(host.fileProbe);
      pluginManager.setFileProbe(host.fileProbe);
      agentManager.setFileProbe(host.fileProbe);
      claudeConversationHistoryService.setFileProbe(host.fileProbe);
      void pluginManager.loadPlugins().then(() => agentManager.loadAgents());
      claudeStorage.setNotificationService(host.notifications);
      pluginManager.setNotificationService(host.notifications);
    },
    refreshAgentMentions: async () => {
      await agentManager.loadAgents();
    },
  };
}

export const claudeWorkspaceRegistration: ProviderWorkspaceRegistration<ClaudeWorkspaceServices> = {
  initialize: async ({ plugin, workspaceFileAdapter }) => createClaudeWorkspaceServices(plugin, workspaceFileAdapter),
};

export function getClaudeWorkspaceServices(): ClaudeWorkspaceServices {
  return ProviderWorkspaceRegistry.requireServices('claude') as ClaudeWorkspaceServices;
}
