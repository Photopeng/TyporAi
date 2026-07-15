import type {
  ProviderChatUIConfig,
  ProviderPermissionModeToggleConfig,
  ProviderReasoningOption,
  ProviderUIOption,
} from '../../../core/providers/types';
import { getTyporaProviderSettings, updateTyporaProviderSettings } from '../settings';

const DEFAULT_CONTEXT_WINDOW = 200_000;
const TYPORA_PERMISSION_MODE_TOGGLE: ProviderPermissionModeToggleConfig = {
  inactiveValue: 'normal',
  inactiveLabel: 'Safe',
  activeValue: 'yolo',
  activeLabel: 'YOLO',
};
const TYPORA_REASONING_OPTIONS: ProviderReasoningOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const typoraChatUIConfig: ProviderChatUIConfig = {
  getPermissionModeToggle(): ProviderPermissionModeToggleConfig {
    return TYPORA_PERMISSION_MODE_TOGGLE;
  },

  getModelOptions(settings: Record<string, unknown>): ProviderUIOption[] {
    const typoraSettings = getTyporaProviderSettings(settings);
    return [{
      value: typoraSettings.apiModel,
      label: typoraSettings.apiModel,
      description: 'Typora API engine',
    }];
  },

  ownsModel(model: string, settings: Record<string, unknown>): boolean {
    return model === getTyporaProviderSettings(settings).apiModel;
  },

  isAdaptiveReasoningModel(): boolean {
    return true;
  },

  getReasoningOptions(): ProviderReasoningOption[] {
    return [...TYPORA_REASONING_OPTIONS];
  },

  getDefaultReasoningValue(): string {
    return 'medium';
  },

  getContextWindowSize(): number {
    return DEFAULT_CONTEXT_WINDOW;
  },

  isDefaultModel(): boolean {
    return false;
  },

  applyModelDefaults(model: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return;
    }

    updateTyporaProviderSettings(settings as Record<string, unknown>, { apiModel: model });
  },

  applyReasoningSelection(_model: string, value: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return;
    }

    const normalized = TYPORA_REASONING_OPTIONS.some((option) => option.value === value)
      ? value
      : 'medium';
    (settings as Record<string, unknown>).effortLevel = normalized;
  },

  normalizeModelVariant(model: string, settings: Record<string, unknown>): string {
    return model.trim() || getTyporaProviderSettings(settings).apiModel;
  },

  getCustomModelIds(): Set<string> {
    return new Set<string>();
  },
};
