/** @jest-environment jsdom */

import { confirm, confirmDelete } from '@/shared/modals/ConfirmModal';

function button(label: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(candidate => candidate.textContent === label);
  if (!result) throw new Error(`Missing modal button: ${label}`);
  return result;
}

describe('confirmation modals', () => {
  afterEach(() => document.body.replaceChildren());

  it('confirms deletion', async () => {
    const result = confirmDelete({}, 'Delete this?');
    expect(document.body.textContent).toContain('Delete this?');
    button('Delete').click();
    await expect(result).resolves.toBe(true);
  });

  it('supports custom confirmation text', async () => {
    const result = confirm({}, 'Proceed?', 'Proceed');
    button('Proceed').click();
    await expect(result).resolves.toBe(true);
  });

  it('resolves false when cancelled', async () => {
    const result = confirmDelete({}, 'Delete this?');
    button('Cancel').click();
    await expect(result).resolves.toBe(false);
  });

  it('resolves false when dismissed with Escape', async () => {
    const result = confirmDelete({}, 'Delete this?');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(result).resolves.toBe(false);
  });
});
