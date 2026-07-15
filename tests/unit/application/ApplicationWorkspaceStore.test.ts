import { ApplicationWorkspaceStore } from '@/application/storage/ApplicationWorkspaceStore';

describe('ApplicationWorkspaceStore', () => {
  it('serializes append operations and continues after a failed write', async () => {
    const values: Record<string, string> = {};
    let fail = true;
    const files = {
      exists: jest.fn(async (path: string) => path in values), readText: jest.fn(async (path: string) => values[path]),
      writeAtomic: jest.fn(async (path: string, value: string) => { if (fail) { fail = false; throw new Error('disk full'); } values[path] = value; }),
    };
    const store = new ApplicationWorkspaceStore('/project', files as never, { join: (...parts: string[]) => parts.join('/'), isAbsolute: (path: string) => path.startsWith('/'), dirname: jest.fn(), normalize: jest.fn() });
    await expect(store.appendText('log.txt', 'a')).rejects.toThrow('disk full');
    await Promise.all([store.appendText('log.txt', 'b'), store.appendText('log.txt', 'c')]);
    expect(values['/project/log.txt']).toBe('bc');
    expect(() => store.writeText('../escape', 'x')).toThrow('contained');
  });
});
