import type { HostServices } from '../../../core/ports';
import type { HomeFileStore } from '../../../core/ports';
import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type {
  ProviderCliResolver,
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import type { WorkspaceFileAdapter } from '../../../core/storage/WorkspaceFileAdapter';
import type TyporAiPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { CodexAgentMentionProvider } from '../agents/CodexAgentMentionProvider';
import { CodexSkillCatalog } from '../commands/CodexSkillCatalog';
import { codexConversationHistoryService } from '../registration';
import { CodexCliResolver } from '../runtime/CodexCliResolver';
import { CodexSkillListingService } from '../skills/CodexSkillListingService';
import { CodexSkillStorage } from '../storage/CodexSkillStorage';
import { CodexSubagentStorage } from '../storage/CodexSubagentStorage';
import { codexSettingsTabRenderer } from '../ui/CodexSettingsTab';

export interface CodexWorkspaceServices extends ProviderWorkspaceServices {
  subagentStorage: CodexSubagentStorage;
  commandCatalog: ProviderCommandCatalog;
  agentMentionProvider: CodexAgentMentionProvider;
  cliResolver: ProviderCliResolver;
  skillListProvider: CodexSkillListingService;
}

function createCodexCliResolver(): ProviderCliResolver {
  return new CodexCliResolver();
}

export async function createCodexWorkspaceServices(
  plugin: TyporAiPlugin,
  workspaceFileAdapter: WorkspaceFileAdapter,
  homeAdapter: HomeFileStore,
): Promise<CodexWorkspaceServices> {
  const subagentStorage = new CodexSubagentStorage(workspaceFileAdapter);
  const agentMentionProvider = new CodexAgentMentionProvider(subagentStorage);
  await agentMentionProvider.loadAgents();

  const skillListProvider = new CodexSkillListingService(plugin);
  const commandCatalog = new CodexSkillCatalog(
    new CodexSkillStorage(
      workspaceFileAdapter,
      homeAdapter,
    ),
    skillListProvider,
    getVaultPath(plugin.app),
  );

  return {
    subagentStorage,
    commandCatalog,
    agentMentionProvider,
    cliResolver: createCodexCliResolver(),
    skillListProvider,
    configureHostServices: (host: HostServices) => {
      skillListProvider.setProcessTransport(host.processes);
      codexConversationHistoryService.configureHost(host.fileProbe, host.environment, host.paths);
    },
    settingsTabRenderer: codexSettingsTabRenderer,
    refreshAgentMentions: async () => {
      await agentMentionProvider.loadAgents();
    },
  };
}

export const codexWorkspaceRegistration: ProviderWorkspaceRegistration<CodexWorkspaceServices> = {
  initialize: async ({ plugin, workspaceFileAdapter, homeAdapter }) => createCodexWorkspaceServices(
    plugin,
    workspaceFileAdapter,
    homeAdapter,
  ),
};

export function getCodexWorkspaceServices(): CodexWorkspaceServices {
  return ProviderWorkspaceRegistry.requireServices('codex') as CodexWorkspaceServices;
}
