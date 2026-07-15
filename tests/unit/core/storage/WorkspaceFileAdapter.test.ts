import { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { WorkspaceFileAdapter } from '@/core/storage/WorkspaceFileAdapter';
import type { TyporaHostApp } from '@/typora/platform';

describe('WorkspaceFileAdapter', () => {
  it('is the platform-neutral adapter implementation', async () => {
    const adapter = {
      exists: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue({ files: ['note.md'], folders: [] }),
      mkdir: jest.fn(),
      read: jest.fn().mockResolvedValue('content'),
      remove: jest.fn(),
      rename: jest.fn(),
      rmdir: jest.fn(),
      stat: jest.fn().mockResolvedValue({ mtime: 1, size: 7 }),
      write: jest.fn(),
    };
    const app = { vault: { adapter } } as unknown as TyporaHostApp;
    const workspaceAdapter = new WorkspaceFileAdapter(app);

    await expect(workspaceAdapter.read('note.md')).resolves.toBe('content');
    await expect(workspaceAdapter.listFiles('.')).resolves.toEqual(['note.md']);
    await expect(workspaceAdapter.stat('note.md')).resolves.toEqual({ mtime: 1, size: 7 });
  });

  it('keeps the legacy VaultFileAdapter export as a compatibility alias', () => {
    expect(VaultFileAdapter).toBe(WorkspaceFileAdapter);
  });
});
