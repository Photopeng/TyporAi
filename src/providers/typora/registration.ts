import { QueryBackedInlineEditService } from '../../core/auxiliary/QueryBackedInlineEditService';
import { QueryBackedInstructionRefineService } from '../../core/auxiliary/QueryBackedInstructionRefineService';
import { QueryBackedTitleGenerationService } from '../../core/auxiliary/QueryBackedTitleGenerationService';
import type { ProviderRegistration } from '../../core/providers/types';
import { TyporaAuxQueryRunner } from './auxiliary/TyporaAuxQueryRunner';
import { TyporaTaskResultInterpreter } from './auxiliary/TyporaTaskResultInterpreter';
import { TYPORA_PROVIDER_CAPABILITIES } from './capabilities';
import { typoraSettingsReconciler } from './env/TyporaSettingsReconciler';
import { TyporaConversationHistoryService } from './history/TyporaConversationHistoryService';
import { TyporaChatRuntime } from './runtime/TyporaChatRuntime';
import { getTyporaProviderSettings } from './settings';
import { typoraChatUIConfig } from './ui/TyporaChatUIConfig';

export const typoraProviderRegistration: ProviderRegistration = {
  blankTabOrder: 20,
  capabilities: TYPORA_PROVIDER_CAPABILITIES,
  chatUIConfig: typoraChatUIConfig,
  createInlineEditService: (plugin) => new QueryBackedInlineEditService(new TyporaAuxQueryRunner(plugin)),
  createInstructionRefineService: (plugin) => new QueryBackedInstructionRefineService(new TyporaAuxQueryRunner(plugin)),
  createRuntime: ({ plugin }) => new TyporaChatRuntime(plugin),
  createTitleGenerationService: (plugin) => new QueryBackedTitleGenerationService({
    createRunner: () => new TyporaAuxQueryRunner(plugin),
    resolveModel: () => getTyporaProviderSettings(plugin.settings as Record<string, unknown>).apiModel,
  }),
  displayNameKey: 'provider.typora',
  environmentKeyPatterns: [/^ANTHROPIC_/i],
  historyService: new TyporaConversationHistoryService(),
  isEnabled: (settings) => getTyporaProviderSettings(settings).enabled,
  settingsReconciler: typoraSettingsReconciler,
  taskResultInterpreter: new TyporaTaskResultInterpreter(),
};
