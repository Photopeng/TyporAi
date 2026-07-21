import { JSDOM } from 'jsdom';

import { setLocale } from '@/i18n/i18n';
import { typoraSettingsTabRenderer } from '@/providers/typora/ui/TyporaSettingsTab';

const mockSaveSettings = jest.fn().mockResolvedValue(undefined);
const mockRefreshModelSelectors = jest.fn();
const mockBroadcastToProviderTabs = jest.fn().mockResolvedValue(undefined);
const mockRefreshModelSelector = jest.fn();

function findField(container: HTMLElement, label: string): HTMLElement {
  const field = [...container.querySelectorAll<HTMLElement>('.setting-item')]
    .find((candidate) => candidate.querySelector('.setting-item-name')?.textContent === label);
  if (!field) throw new Error(`Missing setting: ${label}`);
  return field;
}

async function flushAsyncHandlers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('typoraSettingsTabRenderer', () => {
  let originalDocument: typeof globalThis.document;
  let container: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();
    setLocale('en');
    originalDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><html><body><section id="settings"></section></body></html>');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    container = document.getElementById('settings')!;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    jest.restoreAllMocks();
  });

  it('renders Typora provider controls from provider config without the Obsidian Setting shim', () => {
    typoraSettingsTabRenderer.render(container, createContext({
      providerConfigs: {
        typora: {
          enabled: true,
          apiKey: 'key',
          apiBaseUrl: 'https://example.test/messages',
          apiModel: 'model-a',
        },
      },
    }));

    expect(findField(container, 'Enable API').querySelector<HTMLInputElement>('input')?.checked).toBe(true);
    expect(findField(container, 'API key').querySelector<HTMLInputElement>('input')?.value).toBe('key');
    expect(findField(container, 'API key').querySelector<HTMLInputElement>('input')?.type).toBe('password');
    expect(findField(container, 'API base URL').querySelector<HTMLInputElement>('input')?.value).toBe('https://example.test/messages');
    expect(findField(container, 'API protocol').querySelector<HTMLSelectElement>('select')?.value).toBe('auto');
    expect(findField(container, 'API model').querySelector<HTMLInputElement>('input')?.value).toBe('model-a');
  });

  it('persists enable changes', async () => {
    const settings = { providerConfigs: { typora: { enabled: false } } };
    typoraSettingsTabRenderer.render(container, createContext(settings));
    const toggle = findField(container, 'Enable API').querySelector<HTMLInputElement>('input')!;
    toggle.checked = true;
    toggle.dispatchEvent(new container.ownerDocument.defaultView!.Event('change'));
    await flushAsyncHandlers();

    expect((settings.providerConfigs.typora as any).enabled).toBe(true);
    expect(mockSaveSettings).toHaveBeenCalledTimes(1);
    expect(mockRefreshModelSelectors).toHaveBeenCalledTimes(1);
  });

  it('persists API fields and recycles the affected runtime', async () => {
    const settings = { providerConfigs: { typora: {} } };
    typoraSettingsTabRenderer.render(container, createContext(settings));

    for (const [label, value] of [
      ['API key', 'next-key'],
      ['API base URL', 'https://api.example.test/messages'],
      ['API model', 'model-b'],
    ]) {
      const input = findField(container, label).querySelector<HTMLInputElement>('input')!;
      input.value = value;
      input.dispatchEvent(new container.ownerDocument.defaultView!.Event('input'));
      await flushAsyncHandlers();
    }

    expect(settings.providerConfigs.typora).toMatchObject({
      apiKey: 'next-key',
      apiBaseUrl: 'https://api.example.test/messages',
      apiModel: 'model-b',
    });
    expect(mockSaveSettings).toHaveBeenCalledTimes(3);
    expect(mockBroadcastToProviderTabs).toHaveBeenCalledTimes(3);
    expect(mockRefreshModelSelectors).toHaveBeenCalledTimes(1);
  });

  it('does not persist an invalid API URL', async () => {
    const settings = { providerConfigs: { typora: {} } };
    typoraSettingsTabRenderer.render(container, createContext(settings));
    const input = findField(container, 'API base URL').querySelector<HTMLInputElement>('input')!;
    input.value = 'file:///not-an-api';
    input.dispatchEvent(new container.ownerDocument.defaultView!.Event('input'));
    await flushAsyncHandlers();

    expect((settings.providerConfigs.typora as any).apiBaseUrl).toBeUndefined();
    expect(input.validationMessage).toContain('HTTP');
  });

  it('persists an explicit API protocol and recycles the runtime', async () => {
    const settings = { providerConfigs: { typora: {} } };
    typoraSettingsTabRenderer.render(container, createContext(settings));
    const select = findField(container, 'API protocol').querySelector<HTMLSelectElement>('select')!;
    select.value = 'openai';
    select.dispatchEvent(new container.ownerDocument.defaultView!.Event('change'));
    await flushAsyncHandlers();

    expect((settings.providerConfigs.typora as any).apiProtocol).toBe('openai');
    expect(mockBroadcastToProviderTabs).toHaveBeenCalledTimes(1);
  });

  it('renders a connection test that does not expose document context', () => {
    typoraSettingsTabRenderer.render(container, createContext({ providerConfigs: { typora: {} } }));
    const field = findField(container, 'Test connection');
    expect(field.querySelector('button')?.textContent).toBe('Test API connection');
    expect(field.querySelector('.setting-item-description')?.textContent).toContain('never includes document');
  });
});

function createContext(settings: Record<string, unknown>): any {
  return {
    plugin: {
      settings,
      saveSettings: mockSaveSettings,
      getAllViews: () => [{
        getTabManager: () => ({
          broadcastToProviderTabs: mockBroadcastToProviderTabs,
        }),
        refreshModelSelector: mockRefreshModelSelector,
      }],
    },
    refreshModelSelectors: mockRefreshModelSelectors,
    renderCustomContextLimits: jest.fn(),
    renderHiddenProviderCommandSetting: jest.fn(),
  };
}
