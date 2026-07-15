import { JSDOM } from 'jsdom';

import type { CodexSubagentDefinition } from '@/providers/codex/types/subagent';
import { CodexSubagentModal } from '@/providers/codex/ui/CodexSubagentSettings';

jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/typora/platform', () => ({ setIcon: jest.fn() }));
jest.mock('@/ui/NoticeAdapter', () => ({ NoticeAdapter: class { show() {} } }));

describe('CodexSubagentModal', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  it('saves subagents through native modal controls', async () => {
    const saved: CodexSubagentDefinition[] = [];
    const modal = new CodexSubagentModal(null, [], async agent => { saved.push(agent); });
    modal.open();
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input.typorai-setting-input')];
    const instructions = document.querySelector<HTMLTextAreaElement>('.typorai-sp-content-area');
    if (!instructions) throw new Error('Missing instructions');
    inputs[0].value = 'reviewer';
    inputs[0].dispatchEvent(new dom.window.Event('input'));
    inputs[1].value = 'Reviews code';
    inputs[1].dispatchEvent(new dom.window.Event('input'));
    instructions.value = 'Review carefully.';
    (document.querySelector('.typorai-save-btn') as HTMLButtonElement).click();
    await new Promise(resolve => setImmediate(resolve));

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'reviewer', description: 'Reviews code', developerInstructions: 'Review carefully.' });
  });
});
