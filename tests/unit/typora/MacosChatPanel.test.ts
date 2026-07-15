/**
 * @jest-environment jsdom
 */

import { TyporaEditorApi } from '@/typora/editor-api';
import { MacosChatPanel } from '@/typora/MacosChatPanel';

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
    const panel = new MacosChatPanel(root, client as never, new TyporaEditorApi());

    await panel.initialize();

    const provider = root.querySelector<HTMLSelectElement>('select');
    expect(provider?.value).toBe('codex');
    expect(provider?.querySelector<HTMLOptionElement>('option[value="claude"]')?.disabled).toBe(true);
    expect(provider?.querySelector<HTMLOptionElement>('option[value="codex"]')?.disabled).toBe(false);
  });
});
