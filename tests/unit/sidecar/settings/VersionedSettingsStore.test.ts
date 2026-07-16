import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PersistentSettingsStore } from '@/sidecar/services/settings/PersistentSettingsStore';
import { SettingsRevisionConflictError, VersionedSettingsStore } from '@/sidecar/services/settings/VersionedSettingsStore';

describe('VersionedSettingsStore', () => {
  it('is a revision-checked single writer', () => {
    const store = new VersionedSettingsStore({ mode: 'safe' });
    const initial = store.getSnapshot();
    expect(store.applyPatch({ mode: 'full' }, initial.revision, 'request-1')).toMatchObject({ revision: 1, value: { mode: 'full' } });
    expect(() => store.applyPatch({ mode: 'safe' }, initial.revision, 'request-2')).toThrow(SettingsRevisionConflictError);
  });

  it('persists the latest revision atomically across a restart', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-settings-'));
    const file = path.join(directory, 'settings.json');
    const first = await PersistentSettingsStore.open(file, { mode: 'safe' });
    await first.applyPatch({ mode: 'full' }, 0, 'write-1');
    const second = await PersistentSettingsStore.open(file, { mode: 'safe' });
    expect(second.getSnapshot()).toMatchObject({ revision: 1, value: { mode: 'full' } });
  });
});
