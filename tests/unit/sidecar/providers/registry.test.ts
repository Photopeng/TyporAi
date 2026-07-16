import { SidecarProviderRegistry } from '@/sidecar/providers/registry';

describe('SidecarProviderRegistry', () => {
  it('owns native provider factories outside the Renderer registry', () => {
    const registry = new SidecarProviderRegistry();
    registry.register('fake', () => ({ dispose: () => undefined }));
    expect(registry.list()).toEqual(['fake']);
    expect(registry.create('fake')).toHaveProperty('dispose');
    expect(() => registry.create('codex')).toThrow('not registered in Sidecar');
  });
});
