import { JSDOM } from 'jsdom';

import { McpServerModal } from '@/features/settings/ui/McpServerModal';

jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));

describe('McpServerModal', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  it('saves a stdio server through native modal controls', () => {
    const saved: unknown[] = [];
    const modal = new McpServerModal(null, server => saved.push(server), 'stdio');
    modal.open();

    const name = document.querySelector<HTMLInputElement>('input.typorai-setting-input');
    const command = document.querySelector<HTMLTextAreaElement>('.typorai-mcp-cmd-textarea');
    if (!name || !command) throw new Error('Missing native modal controls');
    name.value = 'local-server';
    name.dispatchEvent(new dom.window.Event('input'));
    command.value = 'node server.js --verbose';
    command.dispatchEvent(new dom.window.Event('input'));
    (document.querySelector('.typorai-save-btn') as HTMLButtonElement).click();

    expect(saved).toEqual([{
      name: 'local-server',
      config: { command: 'node', args: ['server.js', '--verbose'] },
      enabled: true,
      contextSaving: true,
      disabledTools: undefined,
    }]);
    expect(document.querySelector('.typorai-modal-overlay')).toBeNull();
  });

  it('changes type fields through the native select', () => {
    const modal = new McpServerModal(null, () => undefined, 'stdio');
    modal.open();
    const type = document.querySelector<HTMLSelectElement>('select.typorai-setting-input');
    if (!type) throw new Error('Missing type select');
    type.value = 'http';
    type.dispatchEvent(new dom.window.Event('change'));

    expect(document.querySelector<HTMLInputElement>('input[placeholder="settings.mcp.modal.url.placeholder"]')).not.toBeNull();
    expect(document.querySelector('.typorai-mcp-cmd-textarea')).toBeNull();
  });
});
