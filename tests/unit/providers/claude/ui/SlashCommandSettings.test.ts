import { JSDOM } from 'jsdom';

import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';
import { SlashCommandModal } from '@/providers/claude/ui/SlashCommandSettings';

jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/typora/platform', () => ({ setIcon: jest.fn() }));
jest.mock('@/ui/NoticeAdapter', () => ({ NoticeAdapter: class { show() {} } }));

describe('SlashCommandModal', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  it('saves commands through native modal controls', async () => {
    const saved: ProviderCommandEntry[] = [];
    const modal = new SlashCommandModal([], null, async entry => { saved.push(entry); });
    modal.open();
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input.typorai-setting-input')];
    const prompt = document.querySelector<HTMLTextAreaElement>('.typorai-sp-content-area');
    if (!prompt) throw new Error('Missing prompt');
    inputs[0].value = 'review';
    inputs[0].dispatchEvent(new dom.window.Event('input'));
    inputs[1].value = 'Review code';
    inputs[1].dispatchEvent(new dom.window.Event('input'));
    prompt.value = 'Inspect this change.';
    (document.querySelector('.typorai-save-btn') as HTMLButtonElement).click();
    await new Promise(resolve => setImmediate(resolve));

    expect(saved[0]).toMatchObject({ kind: 'command', name: 'review', description: 'Review code', content: 'Inspect this change.' });
  });
});
