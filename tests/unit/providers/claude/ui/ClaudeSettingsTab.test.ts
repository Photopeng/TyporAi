import * as fs from 'fs';
import { JSDOM } from 'jsdom';

import { DEFAULT_CLAUDE_PROVIDER_SETTINGS } from '@/providers/claude/settings';
import { claudeSettingsTabRenderer } from '@/providers/claude/ui/ClaudeSettingsTab';

jest.mock('fs');
jest.mock('@/core/providers/ProviderSettingsCoordinator', () => ({
  ProviderSettingsCoordinator: {
    reconcileTitleGenerationModelSelection: jest.fn((settings: Record<string, unknown>) => {
      if (settings.titleGenerationModel === 'claude-opus-4-6') {
        settings.titleGenerationModel = '';
        return true;
      }
      return false;
    }),
  },
}));
jest.mock('@/features/settings/ui/EnvironmentSettingsSection', () => ({ renderEnvironmentSettingsSection: jest.fn() }));
jest.mock('@/features/settings/ui/McpSettingsManager', () => ({ McpSettingsManager: jest.fn() }));
jest.mock('@/providers/claude/app/ClaudeWorkspaceServices', () => ({
  getClaudeWorkspaceServices: jest.fn(() => ({
    cliResolver: { reset: jest.fn() }, commandCatalog: {}, agentManager: {}, agentStorage: {}, mcpStorage: {}, pluginManager: {},
  })),
}));
jest.mock('@/providers/claude/ui/AgentSettings', () => ({ AgentSettings: jest.fn() }));
jest.mock('@/providers/claude/ui/PluginSettingsManager', () => ({ PluginSettingsManager: jest.fn() }));
jest.mock('@/providers/claude/ui/SlashCommandSettings', () => ({ SlashCommandSettings: jest.fn() }));
jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/utils/env', () => ({ ...jest.requireActual('@/utils/env'), getHostnameKey: () => 'host-a' }));

const saveSettings = jest.fn().mockResolvedValue(undefined);

describe('ClaudeSettingsTab', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    jest.clearAllMocks();
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(false);
    (fs.statSync as jest.MockedFunction<typeof fs.statSync>).mockReturnValue({ isFile: () => true } as fs.Stats);
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  function plugin(overrides: Record<string, unknown> = {}): any {
    return {
      settings: {
        settingsProvider: 'claude', model: 'claude-opus-4-6', titleGenerationModel: '',
        providerConfigs: { claude: { ...DEFAULT_CLAUDE_PROVIDER_SETTINGS, customModels: 'claude-opus-4-6', lastModel: 'sonnet' } },
        ...overrides,
      },
      saveSettings,
      normalizeModelVariantSettings: jest.fn(() => false),
      getView: jest.fn(() => ({ getTabManager: jest.fn(() => ({ broadcastToAllTabs: jest.fn().mockResolvedValue(undefined) })) })),
      getAllViews: jest.fn(() => []),
      app: {},
    };
  }

  function render(target = plugin()): { container: HTMLElement; context: any } {
    const container = document.createElement('section');
    const context = {
      plugin: target, refreshModelSelectors: jest.fn(), renderHiddenProviderCommandSetting: jest.fn(), renderCustomContextLimits: jest.fn(),
    };
    claudeSettingsTabRenderer.render(container, context);
    return { container, context };
  }

  function control<T extends HTMLElement>(container: HTMLElement, name: string): T {
    const item = [...container.querySelectorAll<HTMLElement>('.setting-item')]
      .find(candidate => candidate.querySelector('.setting-item-name')?.textContent === name);
    if (!item) throw new Error(`Missing setting: ${name}`);
    const result = item.querySelector<T>('input, select, textarea');
    if (!result) throw new Error(`Missing control: ${name}`);
    return result;
  }

  async function flush(): Promise<void> { await new Promise(resolve => setImmediate(resolve)); }

  it('renders native controls and current CLI wrapper placeholder', () => {
    const { container } = render();
    const cli = control<HTMLInputElement>(container, 'settings.cliPath.name');

    expect(container.querySelectorAll('.setting-item')).not.toHaveLength(0);
    expect(cli.placeholder).toContain('cli-wrapper.cjs');
  });

  it('persists safe-mode changes through a native select', async () => {
    const target = plugin();
    const { container } = render(target);
    const safeMode = control<HTMLSelectElement>(container, 'settings.claudeSafeMode.name');

    expect([...safeMode.options].map(option => option.value)).toEqual(['acceptEdits', 'auto', 'default']);
    safeMode.value = 'auto';
    safeMode.dispatchEvent(new dom.window.Event('change'));
    await flush();

    expect(target.settings.providerConfigs.claude.safeMode).toBe('auto');
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('defers custom-model persistence until blur', async () => {
    const target = plugin({ titleGenerationModel: 'claude-opus-4-6' });
    const { container, context } = render(target);
    const models = control<HTMLTextAreaElement>(container, 'settings.customModels.name');

    models.value = 'claude-opus-4-7';
    models.dispatchEvent(new dom.window.Event('input'));
    expect(target.settings.providerConfigs.claude.customModels).toBe('claude-opus-4-6');

    models.dispatchEvent(new dom.window.Event('blur'));
    await flush();

    expect(target.settings.providerConfigs.claude.customModels).toBe('claude-opus-4-7');
    expect(target.settings.titleGenerationModel).toBe('');
    expect(context.refreshModelSelectors).toHaveBeenCalledTimes(1);
  });

  it('clears the selected CLI through the shared selector', async () => {
    const target = plugin();
    const { container, context } = render(target);
    const enabled = control<HTMLSelectElement>(container, 'settings.cliProvider.name');

    enabled.value = 'none';
    enabled.dispatchEvent(new dom.window.Event('change'));
    await flush();

    expect(target.settings.providerConfigs.claude.enabled).toBe(false);
    expect(context.refreshModelSelectors).toHaveBeenCalledTimes(1);
  });
});
