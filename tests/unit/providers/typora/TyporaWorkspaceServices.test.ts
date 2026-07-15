import '@/providers';

import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import { typoraWorkspaceRegistration } from '@/providers/typora/app/TyporaWorkspaceServices';

describe('TyporaWorkspaceServices', () => {
  beforeEach(() => {
    ProviderWorkspaceRegistry.clear();
  });

  it('initializes a settings tab renderer for the Typora provider', async () => {
    ProviderWorkspaceRegistry.setServices('typora', await typoraWorkspaceRegistration.initialize({} as any));

    expect(ProviderWorkspaceRegistry.getSettingsTabRenderer('typora')).toHaveProperty('render');
  });
});
