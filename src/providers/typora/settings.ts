import {
  DEFAULT_TYPORA_ENGINE_SETTINGS,
  type TyporaEngineSettings,
} from '../../core/engine-settings';
import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';

export interface TyporaProviderSettings extends TyporaEngineSettings {
  enabled: boolean;
}

export const DEFAULT_TYPORA_PROVIDER_SETTINGS: Readonly<TyporaProviderSettings> = Object.freeze({
  ...DEFAULT_TYPORA_ENGINE_SETTINGS,
  // A new installation has no credentials. Keep API opt-in so the initial
  // provider state never advertises a model that cannot send a request.
  enabled: false,
});

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeProtocol(value: unknown): NonNullable<TyporaProviderSettings['apiProtocol']> {
  return value === 'anthropic' || value === 'openai' ? value : 'auto';
}

export function getTyporaProviderSettings(settings: Record<string, unknown>): TyporaProviderSettings {
  const config = getProviderConfig(settings, 'typora');

  return {
    enabled: typeof config.enabled === 'boolean'
      ? config.enabled
      : DEFAULT_TYPORA_PROVIDER_SETTINGS.enabled,
    apiKey: normalizeString(config.apiKey, DEFAULT_TYPORA_PROVIDER_SETTINGS.apiKey),
    apiBaseUrl: normalizeString(config.apiBaseUrl, DEFAULT_TYPORA_PROVIDER_SETTINGS.apiBaseUrl),
    apiModel: normalizeString(config.apiModel, DEFAULT_TYPORA_PROVIDER_SETTINGS.apiModel),
    apiProtocol: normalizeProtocol(config.apiProtocol),
  };
}

export function updateTyporaProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<TyporaProviderSettings>,
): TyporaProviderSettings {
  const next = {
    ...getTyporaProviderSettings(settings),
    ...updates,
  };

  setProviderConfig(settings, 'typora', next);
  return next;
}
