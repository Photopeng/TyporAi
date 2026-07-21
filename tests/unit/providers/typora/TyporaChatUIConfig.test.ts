import { typoraChatUIConfig } from '@/providers/typora/ui/TyporaChatUIConfig';

describe('typoraChatUIConfig', () => {
  it('does not expose CLI permission controls in text-only API mode', () => {
    expect(typoraChatUIConfig.getPermissionModeToggle?.()).toBeNull();
  });

  it('does not claim arbitrary provider models as Typora defaults', () => {
    expect(typoraChatUIConfig.isDefaultModel('claude-sonnet-4-5')).toBe(false);
    expect(typoraChatUIConfig.isDefaultModel('gpt-5.4-mini')).toBe(false);
  });

  it('owns only the configured Typora API model', () => {
    const settings = {
      providerConfigs: {
        typora: {
          apiModel: 'typora-local-model',
        },
      },
    };

    expect(typoraChatUIConfig.ownsModel('typora-local-model', settings)).toBe(true);
    expect(typoraChatUIConfig.ownsModel('claude-sonnet-4-5', settings)).toBe(false);
  });
});
