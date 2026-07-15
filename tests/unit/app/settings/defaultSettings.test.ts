import { DEFAULT_TYPORAI_SETTINGS } from '@/app/settings/defaultSettings';
import { DEFAULT_TYPORA_ENGINE_SETTINGS } from '@/core/engine-factory';

describe('DEFAULT_TYPORAI_SETTINGS', () => {
  it('starts new installs on the Typora API provider and model', () => {
    expect(DEFAULT_TYPORAI_SETTINGS.settingsProvider).toBe('typora');
    expect(DEFAULT_TYPORAI_SETTINGS.model).toBe(DEFAULT_TYPORA_ENGINE_SETTINGS.apiModel);
  });
});
