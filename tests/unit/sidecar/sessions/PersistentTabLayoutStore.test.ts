import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PersistentTabLayoutStore } from '@/sidecar/services/sessions/PersistentTabLayoutStore';

describe('PersistentTabLayoutStore', () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-tab-layout-')); });
  afterEach(async () => { await rm(directory, { force: true, recursive: true }); });

  it('persists a versioned layout and honours its idempotency key', async () => {
    const filePath = path.join(directory, 'tab-layout.json');
    const store = await PersistentTabLayoutStore.open(filePath);
    const value = { activeTabId: 'tab-1', openTabs: [{ tabId: 'tab-1', conversationId: 'session-1', draftModel: null }] };
    await expect(store.set(value, 0, 'layout-1')).resolves.toMatchObject({ revision: 1, value });
    await expect(store.set(value, 0, 'layout-1')).resolves.toMatchObject({ revision: 1 });
    await expect(PersistentTabLayoutStore.open(filePath)).resolves.toHaveProperty('get');
    expect((await PersistentTabLayoutStore.open(filePath)).get()).toMatchObject({ revision: 1, value });
  });
});
