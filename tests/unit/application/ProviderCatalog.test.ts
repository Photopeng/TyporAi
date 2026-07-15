import { ProviderCatalog } from '@/application/ProviderCatalog';

describe('ProviderCatalog', () => {
  it('keeps provider metadata immutable and rejects duplicate identifiers', () => {
    const catalog = new ProviderCatalog([{ id: 'claude', displayName: 'Claude', capabilities: ['streaming'] }]);
    expect(catalog.get('claude')).toEqual({ id: 'claude', displayName: 'Claude', capabilities: ['streaming'] });
    expect(catalog.get('missing')).toBeNull();
    expect(() => new ProviderCatalog([{ id: 'x', displayName: 'X', capabilities: [] }, { id: 'x', displayName: 'Y', capabilities: [] }])).toThrow('Duplicate provider id');
  });
});
