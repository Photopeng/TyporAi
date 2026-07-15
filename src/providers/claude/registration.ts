import type { ProviderRegistration } from '../../core/providers/types';
import { getClaudeWorkspaceServices } from './app/ClaudeWorkspaceServices';
import { InlineEditService as ClaudeInlineEditService } from './auxiliary/ClaudeInlineEditService';
import { InstructionRefineService as ClaudeInstructionRefineService } from './auxiliary/ClaudeInstructionRefineService';
import { TitleGenerationService as ClaudeTitleGenerationService } from './auxiliary/ClaudeTitleGenerationService';
import { CLAUDE_PROVIDER_CAPABILITIES } from './capabilities';
import { claudeSettingsReconciler } from './env/ClaudeSettingsReconciler';
import { ClaudeConversationHistoryService } from './history/ClaudeConversationHistoryService';
import { TyporAiService as ClaudeChatRuntime } from './runtime/ClaudeChatRuntime';
import { ClaudeTaskResultInterpreter } from './runtime/ClaudeTaskResultInterpreter';
import { getClaudeProviderSettings } from './settings';
import { claudeChatUIConfig } from './ui/ClaudeChatUIConfig';

export const claudeConversationHistoryService = new ClaudeConversationHistoryService();

export const claudeProviderRegistration: ProviderRegistration = {
  displayNameKey: 'provider.claude',
  blankTabOrder: 20,
  isEnabled: (settings) => getClaudeProviderSettings(settings).enabled,
  capabilities: CLAUDE_PROVIDER_CAPABILITIES,
  environmentKeyPatterns: [/^ANTHROPIC_/i, /^CLAUDE_/i],
  chatUIConfig: claudeChatUIConfig,
  settingsReconciler: claudeSettingsReconciler,
  createRuntime: ({ plugin, onExternalContextPathsChanged, processTransport, notificationService, fileBackupService, pathService }) => {
    const workspace = getClaudeWorkspaceServices();
    const resolvedMcpManager = workspace?.mcpManager;
    if (!resolvedMcpManager) {
      throw new Error('Claude workspace services are not initialized.');
    }

    const runtime = new ClaudeChatRuntime(plugin, {
      mcpManager: resolvedMcpManager,
      pluginManager: workspace?.pluginManager,
      agentManager: workspace?.agentManager,
      processTransport,
      notificationService,
      fileBackups: fileBackupService,
      pathService,
    });
    if (typeof runtime.setExternalContextPathsListener === 'function') {
      runtime.setExternalContextPathsListener(onExternalContextPathsChanged);
    }
    return runtime;
  },
  createTitleGenerationService: (plugin, options) => new ClaudeTitleGenerationService(plugin, options?.processTransport),
  createInstructionRefineService: (plugin, options) => new ClaudeInstructionRefineService(plugin, options?.processTransport),
  createInlineEditService: (plugin, options) => new ClaudeInlineEditService(plugin, options?.processTransport),
  historyService: claudeConversationHistoryService,
  taskResultInterpreter: new ClaudeTaskResultInterpreter(),
};
