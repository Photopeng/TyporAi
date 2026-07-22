import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { pathGuard } from '@/shared/pathGuard';

describe('pathGuard', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'typora-ai-path-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  it('resolves paths inside the workspace root', async () => {
    const resolved = await pathGuard.resolve(tempRoot, 'notes/example.md');

    expect(resolved).toBe(path.join(await fs.promises.realpath(tempRoot), 'notes', 'example.md'));
  });

  it('rejects parent-directory traversal', async () => {
    await expect(pathGuard.resolve(tempRoot, '../outside.md')).rejects.toThrow(/escapes workspace root/i);
  });

  it('rejects absolute paths', async () => {
    await expect(pathGuard.resolve(tempRoot, path.join(tempRoot, 'note.md'))).rejects.toThrow(/absolute paths/i);
  });

  it('rejects symlink escapes when symlinks are supported', async () => {
    const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'typora-ai-outside-'));
    const link = path.join(tempRoot, 'linked-outside');

    try {
      await fs.promises.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      await fs.promises.rm(outside, { recursive: true, force: true });
      return;
    }

    await expect(pathGuard.resolve(tempRoot, 'linked-outside/secret.md')).rejects.toThrow(/escapes workspace root/i);
    await fs.promises.rm(outside, { recursive: true, force: true });
  });
});
