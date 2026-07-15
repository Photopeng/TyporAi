import { JSDOM } from 'jsdom';

import { renderEnvironmentSettingsSection } from '@/features/settings/ui/EnvironmentSettingsSection';
import { setLocale } from '@/i18n/i18n';

const envSnippetManager = jest.fn();

jest.mock('@/features/settings/ui/EnvSnippetManager', () => ({
  EnvSnippetManager: class {
    constructor(...args: unknown[]) { envSnippetManager(...args); }
  },
}));

async function flushAsyncHandlers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('renderEnvironmentSettingsSection', () => {
  let originalDocument: typeof globalThis.document;
  let container: HTMLElement;
  let plugin: any;
  let renderCustomContextLimits: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    setLocale('en');
    originalDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><html><body><section id="settings"></section></body></html>');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    container = document.getElementById('settings')!;
    plugin = {
      getEnvironmentVariablesForScope: jest.fn().mockReturnValue('API_TOKEN=secret'),
      applyEnvironmentVariables: jest.fn().mockResolvedValue(undefined),
    };
    renderCustomContextLimits = jest.fn();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  });

  it('renders standard DOM controls and warns about review-sensitive keys', () => {
    renderEnvironmentSettingsSection({
      container,
      plugin,
      scope: 'provider:claude',
      heading: 'Environment',
      name: 'Variables',
      desc: 'Applied to the provider',
      placeholder: 'KEY=value',
      renderCustomContextLimits,
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(textarea.value).toBe('API_TOKEN=secret');
    expect(textarea.rows).toBe(6);
    expect(textarea.dataset.envScope).toBe('provider:claude');
    expect(container.querySelector('.setting-item-heading')?.textContent).toContain('Environment');
    expect(container.querySelector('.typorai-env-review-warning')?.classList.contains('typorai-hidden')).toBe(false);
    expect(renderCustomContextLimits).toHaveBeenCalledTimes(1);
    expect(envSnippetManager).toHaveBeenCalledWith(
      expect.any(Object), plugin, 'provider:claude', expect.any(Function),
    );
  });

  it('saves on blur and refreshes the warning and context limits', async () => {
    renderEnvironmentSettingsSection({
      container,
      plugin,
      scope: 'shared',
      name: 'Variables',
      desc: 'Applied to the provider',
      placeholder: 'KEY=value',
      renderCustomContextLimits,
    });
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'PATH=/tmp';
    textarea.dispatchEvent(new container.ownerDocument.defaultView!.Event('input'));
    textarea.dispatchEvent(new container.ownerDocument.defaultView!.Event('blur'));
    await flushAsyncHandlers();

    expect(plugin.applyEnvironmentVariables).toHaveBeenCalledWith('shared', 'PATH=/tmp');
    expect(renderCustomContextLimits).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.typorai-env-review-warning')?.classList.contains('typorai-hidden')).toBe(true);
  });
});
