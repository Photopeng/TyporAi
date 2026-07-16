import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PersistentWorkspaceGrantStore } from '@/sidecar/services/workspace/PersistentWorkspaceGrantStore';

describe('PersistentWorkspaceGrantStore', () => {
  it('restores the Sidecar-owned workspace grant after restart', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-grant-'));
    const file = path.join(directory, 'grant.json');
    const first = await PersistentWorkspaceGrantStore.open(file);
    await first.grantAndPersist(path.join(directory, 'workspace'));
    const second = await PersistentWorkspaceGrantStore.open(file);
    expect(second.current).toBe(path.join(directory, 'workspace'));
  });
});
