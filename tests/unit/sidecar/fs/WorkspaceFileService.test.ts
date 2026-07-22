import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PathOutsideWorkspaceError, WorkspaceFileService } from '@/sidecar/services/fs/WorkspaceFileService';

describe('WorkspaceFileService backups', () => {
  let root: string;
  let externalRoot: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'typorai-files-'));
    externalRoot = mkdtempSync(path.join(tmpdir(), 'typorai-external-'));
  });
  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
    rmSync(externalRoot, { force: true, recursive: true });
  });

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

  it('rejects a workspace symlink that resolves outside the granted root', async () => {
    writeFileSync(path.join(externalRoot, 'secret.md'), 'private', 'utf8');
    symlinkSync(externalRoot, path.join(root, 'outside'), 'junction');
    const files = new WorkspaceFileService(() => root);

    await expect(files.readText('outside/secret.md')).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
    await expect(files.remove('outside/secret.md')).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  it('returns a canonical target for legal symlinks and missing descendants', async () => {
    const realDirectory = path.join(root, 'real');
    mkdirSync(realDirectory);
    writeFileSync(path.join(realDirectory, 'note.md'), 'canonical', 'utf8');
    symlinkSync(realDirectory, path.join(root, 'alias'), 'junction');
    const files = new WorkspaceFileService(() => root);

    expect(await files.resolveWatchTarget('alias/note.md')).toBe(path.join(realpathSync(realDirectory), 'note.md'));
    await files.writeText('alias/nested/new.md', 'new');
    expect(readFileSync(path.join(realDirectory, 'nested', 'new.md'), 'utf8')).toBe('new');
  });

  it('does not allow remove, rename, or restore to escape through an external symlink', async () => {
    writeFileSync(path.join(root, 'note.md'), 'before', 'utf8');
    writeFileSync(path.join(externalRoot, 'secret.md'), 'private', 'utf8');
    symlinkSync(externalRoot, path.join(root, 'outside'), 'junction');
    const files = new WorkspaceFileService(() => root);
    const backup = await files.createBackup('note.md');

    await expect(files.rename('note.md', 'outside/note.md')).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
    await expect(files.restoreBackup(backup.backupId, 'outside/note.md')).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
    expect(readFileSync(path.join(externalRoot, 'secret.md'), 'utf8')).toBe('private');
  });

  it('refuses to remove the workspace root', async () => {
    const files = new WorkspaceFileService(() => root);

    await expect(files.remove('.')).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
    expect(readFileSync(path.join(root, 'note.md'), { encoding: 'utf8', flag: 'a+' })).toBe('');
  });
});
