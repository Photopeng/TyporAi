/** @jest-environment jsdom */

import { chooseForkTarget } from '@/shared/modals/ForkTargetModal';

function option(label: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>('.typorai-fork-target-option')]
    .find(button => button.textContent === label);
  if (!result) throw new Error(`Missing fork target option: ${label}`);
  return result;
}

describe('chooseForkTarget', () => {
  afterEach(() => document.body.replaceChildren());

  it('resolves current-tab when selected', async () => {
    const result = chooseForkTarget();
    option('Current tab').click();
    await expect(result).resolves.toBe('current-tab');
  });

  it('resolves new-tab when selected', async () => {
    const result = chooseForkTarget();
    option('New tab').click();
    await expect(result).resolves.toBe('new-tab');
  });

  it('resolves null when dismissed', async () => {
    const result = chooseForkTarget();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(result).resolves.toBeNull();
  });

  it('renders both choices and closes cleanly', async () => {
    const result = chooseForkTarget();
    expect(document.querySelectorAll('.typorai-fork-target-option')).toHaveLength(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await result;
  });
});
