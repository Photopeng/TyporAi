import { getRendererProvider, RENDERER_PROVIDERS } from '@/renderer/RendererProviderRegistry';

describe('RendererProviderRegistry', () => {
  it('contains static descriptors without provider runtime factories', () => {
    expect(RENDERER_PROVIDERS.map(provider => provider.providerId)).toEqual(['claude', 'codex', 'opencode', 'typora']);
    expect(getRendererProvider('codex')).toMatchObject({ capabilities: { supportsTurnSteer: true }, displayNameKey: 'provider.codex' });
  });
});
