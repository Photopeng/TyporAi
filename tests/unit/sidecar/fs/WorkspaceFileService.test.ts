import { mkdtempSync, readFileSync,rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { WorkspaceFileService } from '@/sidecar/services/fs/WorkspaceFileService';

describe('WorkspaceFileService backups', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'typorai-files-')); });
  afterEach(() => { rmSync(root, { force: true, recursive: true }); });

  it('restores a Sidecar backup only when the expected file revision still matches', async () => {
    writeFileSync(path.join(root, 'note.md'), 'before', 'utf8');
    const files = new WorkspaceFileService(() => root);
    const backup = await files.createBackup('note.md');
    await files.writeText('note.md', 'changed');
    await files.restoreBackup(backup.backupId, 'note.md');
    expect(readFileSync(path.join(root, 'note.md'), 'utf8')).toBe('before');
  });

  it('restores a deleted external file from its Sidecar backup', async () => {
    writeFileSync(path.join(root, 'note.md'), 'before', 'utf8');
    const files = new WorkspaceFileService(() => root);
    const backup = await files.createBackup('note.md');
    unlinkSync(path.join(root, 'note.md'));
    await files.restoreBackup(backup.backupId, 'note.md');
    expect(readFileSync(path.join(root, 'note.md'), 'utf8')).toBe('before');
  });
});
