import { JSDOM } from 'jsdom';

import { PluginSettingsManager } from '@/providers/claude/ui/PluginSettingsManager';

jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/typora/platform', () => ({ setIcon: jest.fn() }));
jest.mock('@/ui/NoticeAdapter', () => ({ NoticeAdapter: class { show() {} } }));

describe('PluginSettingsManager', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  it('renders and toggles plugins through native controls', async () => {
    const plugins = [{ id: 'review', name: 'Review', enabled: true, scope: 'project' as const }];
    const manager = { getPlugins: jest.fn(() => plugins), togglePlugin: jest.fn().mockResolvedValue(undefined), loadPlugins: jest.fn() };
    const agents = { loadAgents: jest.fn().mockResolvedValue(undefined) };
    const restartTabs = jest.fn().mockResolvedValue(undefined);
    const container = document.createElement('section');
    new PluginSettingsManager(container, { pluginManager: manager as any, agentManager: agents, restartTabs });
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="settings.claude.plugins.disableAria"]');
    if (!toggle) throw new Error('Missing toggle');
    toggle.click();
    await new Promise(resolve => setImmediate(resolve));

    expect(manager.togglePlugin).toHaveBeenCalledWith('review');
    expect(agents.loadAgents).toHaveBeenCalledTimes(1);
    expect(restartTabs).toHaveBeenCalledTimes(1);
  });
});
