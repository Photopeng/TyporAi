import { ApiEngine } from '../engines/api-engine/ApiEngine';
import {
  DEFAULT_TYPORA_ENGINE_SETTINGS,
  type TyporaEngineSettings,
} from './engine-settings';
import type { AgentEngineConfig, IAgentEngine } from './types/agent-engine';

export {
  DEFAULT_TYPORA_ENGINE_SETTINGS,
  type TyporaEngineSettings,
} from './engine-settings';

const SETTINGS_KEY = 'typorai.typora.settings';

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
      apiProtocol: parsed.apiProtocol === 'anthropic' || parsed.apiProtocol === 'openai'
        ? parsed.apiProtocol
        : 'auto',
      apiTimeoutMs: typeof parsed.apiTimeoutMs === 'number' && parsed.apiTimeoutMs > 0
        ? parsed.apiTimeoutMs
        : DEFAULT_TYPORA_ENGINE_SETTINGS.apiTimeoutMs,
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
    apiProtocol: settings.apiProtocol ?? 'auto',
    apiTimeoutMs: settings.apiTimeoutMs,
    effortLevel: settings.effortLevel?.trim(),
  };

  return new ApiEngine(config);
}
