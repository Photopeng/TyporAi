import * as fs from 'fs';
import { JSDOM } from 'jsdom';

import { OPENCODE_DEFAULT_ENVIRONMENT_VARIABLES } from '@/providers/opencode/settings';
import { opencodeSettingsTabRenderer } from '@/providers/opencode/ui/OpencodeSettingsTab';

jest.mock('fs');
jest.mock('@/features/settings/ui/EnvironmentSettingsSection', () => ({ renderEnvironmentSettingsSection: jest.fn() }));
jest.mock('@/providers/opencode/app/OpencodeWorkspaceServices', () => ({
  maybeGetOpencodeWorkspaceServices: jest.fn(() => ({
    agentStorage: {}, cliResolver: { reset: cliResolverReset }, refreshAgentMentions: refreshAgentMentions,
  })),
}));
jest.mock('@/providers/opencode/ui/OpencodeAgentSettings', () => ({
  OpencodeAgentSettings: class {
    constructor(
      _container: HTMLElement,
      _storage: unknown,
      readonly onChanged?: () => Promise<void> | void,
    ) { createdAgents.push(this); }
  },
}));
jest.mock('@/providers/opencode/runtime/OpencodeChatRuntime', () => ({
  OpencodeChatRuntime: class {
    syncConversationState = jest.fn();
    ensureReady = runtimeEnsureReady;
    warmModelMetadata = runtimeWarmModelMetadata;
    cleanup = runtimeCleanup;
  },
}));
jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/utils/env', () => ({ ...jest.requireActual('@/utils/env'), getHostnameKey: () => 'host-a' }));

const saveSettings = jest.fn().mockResolvedValue(undefined);
const cliResolverReset = jest.fn();
const refreshAgentMentions = jest.fn().mockResolvedValue(undefined);
const runtimeEnsureReady = jest.fn().mockResolvedValue(false);
const runtimeWarmModelMetadata = jest.fn().mockResolvedValue(false);
const runtimeCleanup = jest.fn();
const createdAgents: Array<{ onChanged?: () => Promise<void> | void }> = [];

describe('OpencodeSettingsTab', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;
  const broadcasts = jest.fn().mockResolvedValue(undefined);
  const invalidateCommands = jest.fn();
  const refreshSelector = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    createdAgents.length = 0;
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(false);
    (fs.statSync as jest.MockedFunction<typeof fs.statSync>).mockReturnValue({ isFile: () => true } as fs.Stats);
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  function plugin(overrides: Record<string, unknown> = {}): any {
    const view = {
      getTabManager: jest.fn(() => ({ broadcastToProviderTabs: broadcasts })),
      invalidateProviderCommandCaches: invalidateCommands,
      refreshModelSelector: refreshSelector,
    };
    return {
      settings: {
        providerConfigs: { opencode: {
          availableModes: [], cliPath: '', cliPathsByHost: {}, discoveredModels: [], enabled: true,
          environmentVariables: OPENCODE_DEFAULT_ENVIRONMENT_VARIABLES, modelAliases: {}, preferredThinkingByModel: {},
          selectedMode: '', visibleModels: [],
        } },
        ...overrides,
      },
      saveSettings,
      getAllViews: jest.fn(() => [view]),
      app: {},
    };
  }

  function render(target = plugin()): { container: HTMLElement; context: any } {
    const container = document.createElement('section');
    const context = {
      plugin: target, renderHiddenProviderCommandSetting: jest.fn(), refreshModelSelectors: jest.fn(), renderCustomContextLimits: jest.fn(),
    };
    opencodeSettingsTabRenderer.render(container, context);
    return { container, context };
  }

  function control<T extends HTMLElement>(container: HTMLElement, name: string): T {
    const item = [...container.querySelectorAll<HTMLElement>('.setting-item')]
      .find(candidate => candidate.querySelector('.setting-item-name')?.textContent === name
        && candidate.querySelector('input, select, textarea'));
    if (!item) throw new Error(`Missing setting: ${name}`);
    const result = item.querySelector<T>('input, select, textarea');
    if (!result) throw new Error(`Missing control: ${name}`);
    return result;
  }

  async function flush(): Promise<void> { await new Promise(resolve => setImmediate(resolve)); }

  it('renders native setup and model-picker controls', () => {
    const { container } = render();
    expect(control<HTMLSelectElement>(container, 'settings.cliProvider.name').tagName).toBe('SELECT');
    expect(control<HTMLSelectElement>(container, 'Default mode').value).toBe('typorai-yolo');
    expect(container.querySelector('.typorai-opencode-model-picker')).not.toBeNull();
    expect(container.querySelector('details.typorai-opencode-model-picker-catalog')).not.toBeNull();
  });

  it('persists the default mode and recycles OpenCode conversations', async () => {
    const target = plugin();
    const { container } = render(target);
    const mode = control<HTMLSelectElement>(container, 'Default mode');
    mode.value = 'typorai-safe';
    mode.dispatchEvent(new dom.window.Event('change'));
    await flush();

    expect(target.settings.providerConfigs.opencode.selectedMode).toBe('typorai-safe');
    expect(broadcasts).toHaveBeenCalledWith('opencode', expect.any(Function));
  });

  it('stores a valid CLI path per host and resets runtime state', async () => {
    (fs.existsSync as jest.MockedFunction<typeof fs.existsSync>).mockReturnValue(true);
    const target = plugin();
    const { container } = render(target);
    const cli = control<HTMLInputElement>(container, 'settings.opencode.cliPath.name');
    cli.value = '/custom/opencode';
    cli.dispatchEvent(new dom.window.Event('input'));
    await flush();

    expect(target.settings.providerConfigs.opencode.cliPathsByHost).toEqual({ 'host-a': '/custom/opencode' });
    expect(cliResolverReset).toHaveBeenCalledTimes(1);
    expect(broadcasts).toHaveBeenCalledWith('opencode', expect.any(Function));
    expect(invalidateCommands).toHaveBeenCalledWith(['opencode']);
  });

  it('clears the selected CLI through the shared selector', async () => {
    const target = plugin();
    const { container, context } = render(target);
    const enabled = control<HTMLSelectElement>(container, 'settings.cliProvider.name');
    enabled.value = 'none';
    enabled.dispatchEvent(new dom.window.Event('change'));
    await flush();

    expect(target.settings.providerConfigs.opencode.enabled).toBe(false);
    expect(context.refreshModelSelectors).toHaveBeenCalledTimes(1);
  });

  it('persists model selection and warms metadata', async () => {
    runtimeWarmModelMetadata.mockResolvedValue(true);
    const target = plugin({ providerConfigs: { opencode: {
      availableModes: [], cliPath: '', cliPathsByHost: {},
      discoveredModels: [{ label: 'DeepSeek/DeepSeek V4 Pro', rawId: 'deepseek/deepseek-v4-pro' }], enabled: true,
      environmentVariables: OPENCODE_DEFAULT_ENVIRONMENT_VARIABLES, modelAliases: {}, preferredThinkingByModel: {},
      selectedMode: '', visibleModels: [],
    } } });
    const { container, context } = render(target);
    const checkbox = container.querySelector<HTMLInputElement>('.typorai-opencode-model-picker-row input[type="checkbox"]');
    if (!checkbox) throw new Error('Missing model checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new dom.window.Event('change'));
    await flush();
    await flush();

    expect(target.settings.providerConfigs.opencode.visibleModels).toEqual(['deepseek/deepseek-v4-pro']);
    expect(runtimeWarmModelMetadata).toHaveBeenCalledWith('opencode:deepseek/deepseek-v4-pro');
    expect(context.refreshModelSelectors).toHaveBeenCalled();
  });

  it('uses the native subagent manager callback to refresh runtime state', async () => {
    render();
    expect(createdAgents).toHaveLength(1);
    await createdAgents[0].onChanged?.();

    expect(refreshAgentMentions).toHaveBeenCalledTimes(1);
    expect(broadcasts).toHaveBeenCalledWith('opencode', expect.any(Function));
  });
});
