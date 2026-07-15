/**
 * @jest-environment jsdom
 */

import { TyporaEditorApi } from '@/typora/editor-api';
import { buildMacosAgentPrompt, MacosChatPanel } from '@/typora/MacosChatPanel';

describe('MacosChatPanel', () => {
  it('limits the provider picker to agents reported by the Sidecar', async () => {
    const root = document.createElement('section');
    const client = {
      call: jest.fn().mockResolvedValue([
        { available: false, providerId: 'claude' },
        { available: true, providerId: 'codex' },
        { available: false, providerId: 'opencode' },
      ]),
      on: jest.fn(),
    };
    const settings = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), subscribe: jest.fn() };
    const panel = new MacosChatPanel(root, client as never, new TyporaEditorApi(), settings);

    await panel.initialize();

    const provider = root.querySelector<HTMLSelectElement>('select');
    expect(provider?.value).toBe('codex');
    expect(provider?.querySelector<HTMLOptionElement>('option[value="claude"]')?.disabled).toBe(true);
    expect(provider?.querySelector<HTMLOptionElement>('option[value="codex"]')?.disabled).toBe(false);
  });

  it('restores valid messages from Bridge-backed settings storage', async () => {
    const root = document.createElement('section');
    const client = {
      call: jest.fn().mockResolvedValue([{ available: true, providerId: 'codex' }]),
      on: jest.fn(),
    };
    const settings = {
      get: jest.fn().mockResolvedValue([
        { providerId: 'codex', role: 'user', text: 'Summarize this note' },
        { providerId: 'codex', role: 'assistant', text: 'Here is the summary.' },
      ]),
      set: jest.fn(),
      subscribe: jest.fn(),
    };
    const panel = new MacosChatPanel(root, client as never, new TyporaEditorApi(), settings);

    await panel.initialize();

    expect(root.textContent).toContain('Summarize this note');
    expect(root.textContent).toContain('Here is the summary.');
  });
});

describe('buildMacosAgentPrompt', () => {
  it('preserves the recent conversation before the latest user prompt', () => {
    expect(buildMacosAgentPrompt([
      { providerId: 'codex', role: 'user', text: 'Explain this file.' },
      { providerId: 'codex', role: 'assistant', text: 'It handles deployment.' },
      { providerId: 'codex', role: 'user', text: 'What about macOS?' },
    ], 'What about macOS?')).toContain('Assistant: It handles deployment.');
  });
});
