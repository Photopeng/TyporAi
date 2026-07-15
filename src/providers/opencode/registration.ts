import type { ProviderRegistration } from '../../core/providers/types';
import { OpencodeInlineEditService } from './auxiliary/OpencodeInlineEditService';
import { OpencodeInstructionRefineService } from './auxiliary/OpencodeInstructionRefineService';
import { OpencodeTaskResultInterpreter } from './auxiliary/OpencodeTaskResultInterpreter';
import { OpencodeTitleGenerationService } from './auxiliary/OpencodeTitleGenerationService';
import { OPENCODE_PROVIDER_CAPABILITIES } from './capabilities';
import { opencodeSettingsReconciler } from './env/OpencodeSettingsReconciler';
import { opencodeConversationHistoryService } from './history/OpencodeConversationHistoryService';
import { OpencodeChatRuntime } from './runtime/OpencodeChatRuntime';
import { getOpencodeProviderSettings } from './settings';
import { opencodeChatUIConfig } from './ui/OpencodeChatUIConfig';

export const opencodeProviderRegistration: ProviderRegistration = {
  blankTabOrder: 10,
  capabilities: OPENCODE_PROVIDER_CAPABILITIES,
  chatUIConfig: opencodeChatUIConfig,
  createInlineEditService: (plugin, options) => new OpencodeInlineEditService(plugin, options),
  createInstructionRefineService: (plugin, options) => new OpencodeInstructionRefineService(plugin, options),
  createRuntime: ({ plugin, processTransport, fileStore, pathService }) => new OpencodeChatRuntime(plugin, processTransport, fileStore, pathService),
  createTitleGenerationService: (plugin, options) => new OpencodeTitleGenerationService(plugin, options),
  displayNameKey: 'provider.opencode',
  environmentKeyPatterns: [/^OPENCODE_/i],
  historyService: opencodeConversationHistoryService,
  isEnabled: (settings) => getOpencodeProviderSettings(settings).enabled,
  settingsReconciler: opencodeSettingsReconciler,
  taskResultInterpreter: new OpencodeTaskResultInterpreter(),
};
