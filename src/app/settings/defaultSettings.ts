import { DEFAULT_TYPORA_ENGINE_SETTINGS } from '../../core/engine-settings';
import { getDefaultHiddenProviderCommands } from '../../core/providers/commands/hiddenCommands';
import { type TyporAiSettings } from '../../core/types/settings';
import { getBuiltInProviderDefaultConfigs } from '../../providers/defaultProviderConfigs';

export const DEFAULT_TYPORAI_SETTINGS: TyporAiSettings = {
  userName: '',

  permissionMode: 'yolo',

  model: DEFAULT_TYPORA_ENGINE_SETTINGS.apiModel,
  thinkingBudget: 'off',
  effortLevel: 'high',
  serviceTier: 'default',
  enableAutoTitleGeneration: true,
  titleGenerationModel: '',

  excludedTags: [],
  mediaFolder: '',
  systemPrompt: '',

  sharedEnvironmentVariables: '',
  envSnippets: [],
  customContextLimits: {},
  customModelAliases: {},

  keyboardNavigation: {
    scrollUpKey: 'w',
    scrollDownKey: 's',
    focusInputKey: 'i',
  },
  requireCommandOrControlEnterToSend: false,

  locale: 'en',

  providerConfigs: getBuiltInProviderDefaultConfigs(),

  settingsProvider: 'typora',
  savedProviderModel: {},
  savedProviderEffort: {},
  savedProviderServiceTier: {},
  savedProviderThinkingBudget: {},
  savedProviderPermissionMode: {},

  lastCustomModel: '',

  maxTabs: 3,
  enableAutoScroll: true,
  deferMathRenderingDuringStreaming: true,
  expandFileEditsByDefault: false,
  chatViewPlacement: 'right-sidebar',
  cursorFlowEnabled: false,

  hiddenProviderCommands: getDefaultHiddenProviderCommands(),
};
