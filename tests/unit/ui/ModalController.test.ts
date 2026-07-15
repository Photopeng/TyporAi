import { JSDOM } from 'jsdom';

import { ModalController } from '@/ui/ModalController';

describe('ModalController', () => {
  let originalDocument: typeof globalThis.document;
  let originalWindow: typeof globalThis.window;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow, writable: true });
  });

  it('closes a configured dialog on Escape and runs its cleanup once', () => {
    const controller = new ModalController();
    const close = jest.fn();
    const content = document.createDocumentFragment();
    content.append(document.createElement('header'));

    controller.open(content, 'Settings', {
      dialogClass: 'typorai-typora-settings-modal',
      id: 'typorai-typora-settings-modal',
      overlayClass: 'typorai-typora-settings-overlay',
      onClose: close,
    });

    const overlay = document.getElementById('typorai-typora-settings-modal');
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains('typorai-typora-settings-overlay')).toBe(true);
    expect(overlay?.querySelector('[role="dialog"]')?.classList.contains('typorai-typora-settings-modal')).toBe(true);

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.getElementById('typorai-typora-settings-modal')).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
    controller.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
