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
