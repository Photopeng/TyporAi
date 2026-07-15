/**
 * @jest-environment jsdom
 */

import { DomHotkeyAdapter } from '@/adapters/hotkey';

describe('DomHotkeyAdapter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('dispatches matching global hotkeys', () => {
    const adapter = new DomHotkeyAdapter();
    const handler = jest.fn();
    adapter.register('global', 'Ctrl+K', handler);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));

    expect(handler).toHaveBeenCalledTimes(1);
    adapter.unregisterAll();
  });

  it('scopes panel hotkeys to the panel root', () => {
    const panelRoot = document.createElement('section');
    const input = document.createElement('input');
    panelRoot.appendChild(input);
    document.body.appendChild(panelRoot);

    const adapter = new DomHotkeyAdapter({ panelRoot });
    const handler = jest.fn();
    adapter.register('panel', 'Enter', handler);

    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(handler).toHaveBeenCalledTimes(1);
    adapter.unregisterAll();
  });

  it('removes the document listener on unregisterAll', () => {
    const adapter = new DomHotkeyAdapter();
    const handler = jest.fn();
    adapter.register('global', 'Escape', handler);
    adapter.unregisterAll();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not dispatch events already handled by focused UI', () => {
    const adapter = new DomHotkeyAdapter();
    const handler = jest.fn();
    adapter.register('global', 'Ctrl+Enter', handler);

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
    adapter.unregisterAll();
  });
});
