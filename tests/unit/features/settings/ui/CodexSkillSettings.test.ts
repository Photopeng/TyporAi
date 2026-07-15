import { JSDOM } from 'jsdom';

import type { ProviderCommandCatalog } from '@/core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';
import { createCodexSkillPersistenceKey } from '@/providers/codex/storage/CodexSkillStorage';
import { CodexSkillModal, CodexSkillSettings } from '@/providers/codex/ui/CodexSkillSettings';

jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));
jest.mock('@/typora/platform', () => ({ setIcon: jest.fn() }));
jest.mock('@/ui/NoticeAdapter', () => ({ NoticeAdapter: class { show() {} } }));

function entry(name: string): ProviderCommandEntry {
  return {
    id: `codex-skill-${name}`, providerId: 'codex', kind: 'skill', name,
    description: `${name} description`, content: `${name} content`, scope: 'vault', source: 'user',
    isEditable: true, isDeletable: true, displayPrefix: '$', insertPrefix: '$',
  };
}

function catalog(entries: ProviderCommandEntry[] = []): ProviderCommandCatalog {
  return {
    listDropdownEntries: jest.fn(), listVaultEntries: jest.fn().mockResolvedValue(entries),
    saveVaultEntry: jest.fn().mockResolvedValue(undefined), deleteVaultEntry: jest.fn().mockResolvedValue(undefined),
    setRuntimeCommands: jest.fn(), getDropdownConfig: jest.fn(), refresh: jest.fn().mockResolvedValue(undefined),
  };
}

describe('CodexSkillSettings', () => {
  let dom: JSDOM;
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  });

  afterEach(() => Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument }));

  it('saves skills through native modal controls', async () => {
    const saved: ProviderCommandEntry[] = [];
    const modal = new CodexSkillModal(null, async value => { saved.push(value); });
    modal.open();
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input.typorai-setting-input')];
    const content = document.querySelector<HTMLTextAreaElement>('.typorai-sp-content-area');
    if (!content) throw new Error('Missing content textarea');
    inputs[0].value = 'review';
    inputs[0].dispatchEvent(new dom.window.Event('input'));
    content.value = 'Review this change';
    (document.querySelector('.typorai-save-btn') as HTMLButtonElement).click();
    await new Promise(resolve => setImmediate(resolve));

    expect(saved[0].persistenceKey).toBe(createCodexSkillPersistenceKey({ rootId: 'vault-codex' }));
    expect(saved[0].name).toBe('review');
  });

  it('renders and deletes vault skills with native controls', async () => {
    const item = entry('review');
    const source = catalog([item]);
    const container = document.createElement('section');
    const settings = new CodexSkillSettings(container, source);
    await new Promise(resolve => setImmediate(resolve));

    expect(container.querySelector('.typorai-sp-item-name')?.textContent).toBe('$review');
    await settings.deleteEntry(item);
    expect(source.deleteVaultEntry).toHaveBeenCalledWith(item);
  });
});
