import {
  normalizeSingleEnabledCliProvider,
  setSingleEnabledCliProvider,
} from '@/core/providers/cliProviderSelection';

describe('cliProviderSelection', () => {
  it('enables only the selected CLI provider and makes it the settings provider', () => {
    const settings: Record<string, any> = {
      settingsProvider: 'typora',
      providerConfigs: {
        claude: { enabled: false, customModels: 'claude-custom' },
        codex: { enabled: true, mode: 'plan' },
        opencode: { enabled: true, selectedMode: 'build' },
        typora: { enabled: true },
      },
    };

    setSingleEnabledCliProvider(settings, 'claude', true);

    expect(settings.settingsProvider).toBe('claude');
    expect(settings.providerConfigs.claude).toMatchObject({
      enabled: true,
      customModels: 'claude-custom',
    });
    expect(settings.providerConfigs.codex).toMatchObject({
      enabled: false,
      mode: 'plan',
    });
    expect(settings.providerConfigs.opencode).toMatchObject({
      enabled: false,
      selectedMode: 'build',
    });
    expect(settings.providerConfigs.typora.enabled).toBe(true);
  });

  it('returns settings provider to Typora when the active CLI provider is disabled', () => {
    const settings: Record<string, any> = {
      settingsProvider: 'codex',
      providerConfigs: {
        codex: { enabled: true },
      },
    };

    setSingleEnabledCliProvider(settings, 'codex', false);

    expect(settings.settingsProvider).toBe('typora');
    expect(settings.providerConfigs.codex.enabled).toBe(false);
  });

  it('normalizes stored settings with multiple enabled CLI providers', () => {
    const settings: Record<string, any> = {
      settingsProvider: 'opencode',
      providerConfigs: {
        claude: { enabled: true },
        codex: { enabled: true },
        opencode: { enabled: true },
      },
    };

    expect(normalizeSingleEnabledCliProvider(settings)).toBe(true);
    expect(settings.providerConfigs).toMatchObject({
      claude: { enabled: false },
      codex: { enabled: false },
      opencode: { enabled: true },
    });
  });
});
