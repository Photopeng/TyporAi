import { JSDOM } from 'jsdom';

import { McpTestModal } from '@/features/settings/ui/McpTestModal';

jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/typora/platform', () => ({ setIcon: jest.fn() }));

describe('McpTestModal', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  it('renders verification results with native controls', () => {
    const modal = new McpTestModal('local');
    modal.open();
    modal.setResult({ success: true, tools: [{ name: 'search', description: 'Search files' }] });

    expect(document.querySelector('.typorai-mcp-test-status')).not.toBeNull();
    expect(document.querySelector('.typorai-mcp-test-tool-name')?.textContent).toBe('search');
    expect(document.querySelector('.typorai-mcp-test-buttons button')?.textContent).toBe('settings.mcp.test.close');
  });

  it('toggles a tool through standard click events', async () => {
    const onToggle = jest.fn().mockResolvedValue(undefined);
    const modal = new McpTestModal('local', [], onToggle);
    modal.open();
    modal.setResult({ success: true, tools: [{ name: 'search' }] });
    const toggle = document.querySelector<HTMLElement>('.checkbox-container');
    if (!toggle) throw new Error('Missing tool toggle');
    toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setImmediate(resolve));

    expect(onToggle).toHaveBeenCalledWith('search', false);
    expect(document.querySelector('.typorai-mcp-test-tool')?.classList.contains('typorai-mcp-test-tool-disabled')).toBe(true);
  });
});
