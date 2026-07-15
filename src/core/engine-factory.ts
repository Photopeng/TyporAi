import { ApiEngine } from '../engines/api-engine/ApiEngine';
import type { AgentEngineConfig, IAgentEngine } from './types/agent-engine';

const SETTINGS_KEY = 'typorai.typora.settings';

export interface TyporaEngineSettings {
  apiKey: string;
  apiBaseUrl: string;
  apiModel: string;
  effortLevel?: string;
}

export const DEFAULT_TYPORA_ENGINE_SETTINGS: TyporaEngineSettings = {
  apiKey: '',
  apiBaseUrl: 'https://api.anthropic.com/v1/messages',
  apiModel: 'claude-sonnet-4-20250514',
};

export function loadTyporaEngineSettings(storage: Storage = window.localStorage): TyporaEngineSettings {
  const raw = storage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_TYPORA_ENGINE_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Partial<TyporaEngineSettings>;
    return {
      apiKey: typeof parsed.apiKey === 'string'
        ? parsed.apiKey
        : DEFAULT_TYPORA_ENGINE_SETTINGS.apiKey,
      apiBaseUrl: typeof parsed.apiBaseUrl === 'string'
        ? parsed.apiBaseUrl
        : DEFAULT_TYPORA_ENGINE_SETTINGS.apiBaseUrl,
      apiModel: typeof parsed.apiModel === 'string'
        ? parsed.apiModel
        : DEFAULT_TYPORA_ENGINE_SETTINGS.apiModel,
    };
  } catch {
    return { ...DEFAULT_TYPORA_ENGINE_SETTINGS };
  }
}

export function saveTyporaEngineSettings(
  settings: TyporaEngineSettings,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function createAgentEngine(settings = loadTyporaEngineSettings()): IAgentEngine {
  const config: AgentEngineConfig = {
    apiKey: settings.apiKey.trim(),
    apiBaseUrl: settings.apiBaseUrl.trim() || DEFAULT_TYPORA_ENGINE_SETTINGS.apiBaseUrl,
    apiModel: settings.apiModel.trim() || DEFAULT_TYPORA_ENGINE_SETTINGS.apiModel,
    effortLevel: settings.effortLevel?.trim(),
  };

  return new ApiEngine(config);
}
