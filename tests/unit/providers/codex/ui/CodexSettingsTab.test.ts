import * as fs from 'fs';
import { JSDOM } from 'jsdom';

import { DEFAULT_CODEX_PROVIDER_SETTINGS } from '@/providers/codex/settings';
import { codexSettingsTabRenderer } from '@/providers/codex/ui/CodexSettingsTab';

jest.mock('fs');
jest.mock('@/core/providers/ProviderSettingsCoordinator', () => ({
  ProviderSettingsCoordinator: {
    reconcileTitleGenerationModelSelection: jest.fn((settings: Record<string, unknown>) => {
      if (settings.titleGenerationModel === 'my-custom-model') {
        settings.titleGenerationModel = '';
        return true;
      }
      return false;
    }),
  },
}));
jest.mock('@/features/settings/ui/EnvironmentSettingsSection', () => ({
  renderEnvironmentSettingsSection: jest.fn(),
}));
jest.mock('@/providers/codex/app/CodexWorkspaceServices', () => ({
  getCodexWorkspaceServices: jest.fn(() => ({
    commandCatalog: null,
    subagentStorage: {},
    refreshAgentMentions: jest.fn(),
  })),
}));
jest.mock('@/providers/codex/ui/CodexSkillSettings', () => ({ CodexSkillSettings: jest.fn() }));
jest.mock('@/providers/codex/ui/CodexSubagentSettings', () => ({ CodexSubagentSettings: jest.fn() }));
jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/utils/env', () => ({
  ...jest.requireActual('@/utils/env'),
  getHostnameKey: () => 'host-a',
}));

const saveSettings = jest.fn().mockResolvedValue(undefined);
const broadcastToAllTabs = jest.fn().mockResolvedValue(undefined);

describe('CodexSettingsTab', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(false);
    (fs.statSync as jest.MockedFunction<typeof fs.statSync>).mockReturnValue({ isFile: () => true } as fs.Stats);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  function createPlugin(overrides: Record<string, unknown> = {}): any {
    return {
      settings: {
        settingsProvider: 'codex',
        model: 'my-custom-model',
        titleGenerationModel: '',
        providerConfigs: { codex: { ...DEFAULT_CODEX_PROVIDER_SETTINGS, enabled: true, customModels: 'my-custom-model' } },
        ...overrides,
      },
      saveSettings,
      getView: jest.fn(() => ({ getTabManager: jest.fn(() => ({ broadcastToAllTabs })) })),
      app: {},
    };
  }

  function render(plugin = createPlugin()): { container: HTMLElement; context: any } {
    const container = document.createElement('section');
    const context = {
      plugin,
      platform: process.platform === 'win32' ? 'windows' : 'linux',
      renderHiddenProviderCommandSetting: jest.fn(),
      refreshModelSelectors: jest.fn(),
      renderCustomContextLimits: jest.fn(),
    };
    codexSettingsTabRenderer.render(container, context);
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

  async function flush(): Promise<void> {
    await new Promise(resolve => setImmediate(resolve));
  }

  it('renders native setup controls and Windows-only fields', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { container } = render();

    expect(container.querySelectorAll('.setting-item')).not.toHaveLength(0);
    expect(control<HTMLSelectElement>(container, 'settings.codex.installationMethod.name').tagName).toBe('SELECT');
    expect(control<HTMLInputElement>(container, 'settings.codex.wslDistro.name').tagName).toBe('INPUT');
  });

  it('does not render Windows-only fields on other platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const { container } = render();

    expect(() => control(container, 'settings.codex.installationMethod.name')).toThrow('Missing setting');
    expect(() => control(container, 'settings.codex.wslDistro.name')).toThrow('Missing setting');
  });

  it('persists enabled state through native change events', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const plugin = createPlugin();
    const { container, context } = render(plugin);
    const enabled = control<HTMLInputElement>(container, 'settings.codex.enable.name');

    enabled.checked = false;
    enabled.dispatchEvent(new dom.window.Event('change'));
    await flush();

    expect(plugin.settings.providerConfigs.codex.enabled).toBe(false);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(context.refreshModelSelectors).toHaveBeenCalledTimes(1);
  });

  it('accepts a Linux-side CLI command in WSL mode', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const plugin = createPlugin();
    const { container } = render(plugin);
    const installation = control<HTMLSelectElement>(container, 'settings.codex.installationMethod.name');
    installation.value = 'wsl';
    installation.dispatchEvent(new dom.window.Event('change'));
    await flush();

    const cli = control<HTMLInputElement>(container, 'settings.codex.cliPath.name');
    cli.value = 'codex';
    cli.dispatchEvent(new dom.window.Event('input'));
    await flush();

    expect(plugin.settings.providerConfigs.codex.installationMethodsByHost).toEqual({ 'host-a': 'wsl' });
    expect(plugin.settings.providerConfigs.codex.cliPathsByHost['host-a']).toBe('codex');
    expect(broadcastToAllTabs).toHaveBeenCalledTimes(1);
  });

  it('rejects Windows CLI paths in WSL mode', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const plugin = createPlugin();
    const { container } = render(plugin);
    const installation = control<HTMLSelectElement>(container, 'settings.codex.installationMethod.name');
    installation.value = 'wsl';
    installation.dispatchEvent(new dom.window.Event('change'));
    await flush();

    const cli = control<HTMLInputElement>(container, 'settings.codex.cliPath.name');
    cli.value = 'C:\\Users\\me\\codex.exe';
    cli.dispatchEvent(new dom.window.Event('input'));
    await flush();

    expect(plugin.settings.providerConfigs.codex.cliPathsByHost['host-a']).toBeUndefined();
    expect(container.querySelector('.typorai-cli-path-validation')?.classList.contains('typorai-hidden')).toBe(false);
  });

  it('defers custom-model persistence until blur', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const plugin = createPlugin({ titleGenerationModel: 'my-custom-model' });
    const { container, context } = render(plugin);
    const models = control<HTMLTextAreaElement>(container, 'settings.customModels.name');

    models.value = 'different-custom-model';
    models.dispatchEvent(new dom.window.Event('input'));
    expect(plugin.settings.providerConfigs.codex.customModels).toBe('my-custom-model');

    models.dispatchEvent(new dom.window.Event('blur'));
    await flush();

    expect(plugin.settings.providerConfigs.codex.customModels).toBe('different-custom-model');
    expect(plugin.settings.titleGenerationModel).toBe('');
    expect(context.refreshModelSelectors).toHaveBeenCalledTimes(1);
  });
});
