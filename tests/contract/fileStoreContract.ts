/* eslint-disable jest/no-export -- Contract functions are imported by host-specific test suites. */

import type { FileStore } from '@/core/ports';

export function fileStoreContract(createStore: () => FileStore, root: string): void {
  describe('FileStore contract', () => {
    it('writes atomically, reads, stats, lists, renames, and removes', async () => {
      const files = createStore();
      const original = `${root}/nested/note.txt`;
      const renamed = `${root}/nested/renamed.txt`;
      await files.writeAtomic(original, 'hello');
      await expect(files.exists(original)).resolves.toBe(true);
      await expect(files.readText(original)).resolves.toBe('hello');
      await expect(files.stat(original)).resolves.toMatchObject({ kind: 'file', size: 5 });
      await expect(files.list(`${root}/nested`)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'note.txt' })]));
      await files.rename(original, renamed);
      await files.remove(renamed);
      await expect(files.exists(renamed)).resolves.toBe(false);
    });
  });
}
