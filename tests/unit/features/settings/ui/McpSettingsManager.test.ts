import { JSDOM } from 'jsdom';

import { McpSettingsManager } from '@/features/settings/ui/McpSettingsManager';

jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/typora/platform', () => ({ setIcon: jest.fn() }));
jest.mock('@/ui/NoticeAdapter', () => ({ NoticeAdapter: class { show() {} } }));

describe('McpSettingsManager', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  it('renders and toggles MCP servers with native DOM controls', async () => {
    const servers = [{
      name: 'local', config: { command: 'node' }, enabled: true, contextSaving: true,
    }];
    const storage = { load: jest.fn().mockResolvedValue(servers), save: jest.fn().mockResolvedValue(undefined) };
    const reload = jest.fn().mockResolvedValue(undefined);
    const container = document.createElement('section');
    const manager = new McpSettingsManager(container, { mcpStorage: storage as any, broadcastMcpReload: reload });
    await new Promise(resolve => setImmediate(resolve));

    expect(container.querySelector('.typorai-mcp-name')?.textContent).toBe('local');
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="settings.mcp.disableAria"]');
    if (!toggle) throw new Error('Missing toggle');
    toggle.click();
    await new Promise(resolve => setImmediate(resolve));

    expect(servers[0].enabled).toBe(false);
    expect(storage.save).toHaveBeenCalledWith(servers);
    expect(reload).toHaveBeenCalledTimes(1);
    manager.dispose();
  });
});
