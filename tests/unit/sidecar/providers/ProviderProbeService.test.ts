import { ProviderProbeService } from '@/sidecar/services/providers/ProviderProbeService';

describe('ProviderProbeService', () => {
  it('reports the in-Sidecar Typora/API provider without exposing a renderer executable', async () => {
    await expect(new ProviderProbeService().probe('typora')).resolves.toEqual({ available: true, executable: null, providerId: 'typora' });
  });

  it('returns a complete provider status list', async () => {
    const providers = await new ProviderProbeService().list();
    expect(providers.map(provider => provider.providerId)).toEqual(['claude', 'codex', 'opencode', 'typora']);
  });
});
