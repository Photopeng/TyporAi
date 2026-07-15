import type { ProviderRegistration } from '../../core/providers/types';
import { CodexInlineEditService } from './auxiliary/CodexInlineEditService';
import { CodexInstructionRefineService } from './auxiliary/CodexInstructionRefineService';
import { CodexTaskResultInterpreter } from './auxiliary/CodexTaskResultInterpreter';
import { CodexTitleGenerationService } from './auxiliary/CodexTitleGenerationService';
import { CODEX_PROVIDER_CAPABILITIES } from './capabilities';
import { codexSettingsReconciler } from './env/CodexSettingsReconciler';
import { CodexConversationHistoryService } from './history/CodexConversationHistoryService';
import { codexSubagentLifecycleAdapter } from './normalization/codexSubagentNormalization';
import { CodexChatRuntime } from './runtime/CodexChatRuntime';
import { getCodexProviderSettings } from './settings';
import { codexChatUIConfig } from './ui/CodexChatUIConfig';

export const codexConversationHistoryService = new CodexConversationHistoryService();

export const codexProviderRegistration: ProviderRegistration = {
  displayNameKey: 'provider.codex',
  blankTabOrder: 15,
  isEnabled: (settings) => getCodexProviderSettings(settings).enabled,
  capabilities: CODEX_PROVIDER_CAPABILITIES,
  environmentKeyPatterns: [/^OPENAI_/i, /^CODEX_/i],
  chatUIConfig: codexChatUIConfig,
  settingsReconciler: codexSettingsReconciler,
  createRuntime: ({ plugin, processTransport, fileStore, fileProbe, pathService, environmentService }) => new CodexChatRuntime(
    plugin,
    processTransport,
    fileStore,
    fileProbe,
    pathService,
    environmentService,
  ),
  createTitleGenerationService: (plugin, options) => new CodexTitleGenerationService(plugin, options?.processTransport),
  createInstructionRefineService: (plugin, options) => new CodexInstructionRefineService(plugin, options?.processTransport),
  createInlineEditService: (plugin, options) => new CodexInlineEditService(plugin, options?.processTransport),
  historyService: codexConversationHistoryService,
  taskResultInterpreter: new CodexTaskResultInterpreter(),
  subagentLifecycleAdapter: codexSubagentLifecycleAdapter,
};
