import type { ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import type {
  ProviderTabWarmupPolicy,
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import type { WorkspaceFileAdapter } from '../../../core/storage/WorkspaceFileAdapter';
import { OpencodeAgentMentionProvider } from '../agents/OpencodeAgentMentionProvider';
import { OpencodeCommandCatalog } from '../commands/OpencodeCommandCatalog';
import { opencodeConversationHistoryService } from '../history/OpencodeConversationHistoryService';
import { OpencodeCliResolver } from '../runtime/OpencodeCliResolver';
import { OpencodeAgentStorage } from '../storage/OpencodeAgentStorage';
import { opencodeSettingsTabRenderer } from '../ui/OpencodeSettingsTab';
import { OpencodeRuntimeCommandLoader } from './OpencodeRuntimeCommandLoader';

export interface OpencodeWorkspaceServices extends ProviderWorkspaceServices {
  agentStorage: OpencodeAgentStorage;
  agentMentionProvider: OpencodeAgentMentionProvider;
  commandCatalog: ProviderCommandCatalog;
}

const opencodeTabWarmupPolicy: ProviderTabWarmupPolicy = {
  resolveMode() {
    return 'commands';
  },
};

export async function createOpencodeWorkspaceServices(
  workspaceFileAdapter: WorkspaceFileAdapter,
): Promise<OpencodeWorkspaceServices> {
  const agentStorage = new OpencodeAgentStorage(workspaceFileAdapter);
  const agentMentionProvider = new OpencodeAgentMentionProvider(agentStorage);
  await agentMentionProvider.loadAgents();

  return {
    agentStorage,
    agentMentionProvider,
    commandCatalog: new OpencodeCommandCatalog(),
    configureHostServices: host => {
      opencodeConversationHistoryService.setProcessTransport(host.processes);
      opencodeConversationHistoryService.setFileProbe(host.fileProbe);
    },
    dispose: () => {
      opencodeConversationHistoryService.setProcessTransport(undefined);
      opencodeConversationHistoryService.setFileProbe(undefined);
    },
    cliResolver: new OpencodeCliResolver(),
    runtimeCommandLoader: new OpencodeRuntimeCommandLoader(),
    settingsTabRenderer: opencodeSettingsTabRenderer,
    tabWarmupPolicy: opencodeTabWarmupPolicy,
    refreshAgentMentions: async () => {
      await agentMentionProvider.loadAgents();
    },
  };
}

export const opencodeWorkspaceRegistration: ProviderWorkspaceRegistration<OpencodeWorkspaceServices> = {
  initialize: async ({ workspaceFileAdapter }) => createOpencodeWorkspaceServices(workspaceFileAdapter),
};

export function maybeGetOpencodeWorkspaceServices(): OpencodeWorkspaceServices | null {
  return ProviderWorkspaceRegistry.getServices('opencode') as OpencodeWorkspaceServices | null;
}
