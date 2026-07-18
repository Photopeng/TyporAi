import { mkdtemp,writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ProviderProbeService } from '@/sidecar/services/providers/ProviderProbeService';

describe('ProviderProbeService', () => {
  it('reports the in-Sidecar Typora/API provider without exposing a renderer executable', async () => {
    await expect(new ProviderProbeService().probe('typora')).resolves.toEqual({ available: true, executable: null, providerId: 'typora' });
  });

  it('returns a complete provider status list', async () => {
    const providers = await new ProviderProbeService().list();
    expect(providers.map(provider => provider.providerId)).toEqual(['claude', 'codex', 'opencode', 'typora']);
  });

  it('honors a configured absolute CLI path that is not on PATH', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'typorai-provider-probe-'));
    const executable = path.join(directory, 'custom-claude');
    await writeFile(executable, 'test', 'utf8');

    await expect(new ProviderProbeService().probe('claude', executable)).resolves.toEqual({
      available: true,
      executable: path.resolve(executable),
      providerId: 'claude',
    });
  });
});
