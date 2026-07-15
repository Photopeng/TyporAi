import { typoraChatUIConfig } from '@/providers/typora/ui/TyporaChatUIConfig';

describe('typoraChatUIConfig', () => {
  it('exposes the same SAFE/YOLO document editing gate as CLI providers', () => {
    expect(typoraChatUIConfig.getPermissionModeToggle?.()).toEqual({
      activeLabel: 'YOLO',
      activeValue: 'yolo',
      inactiveLabel: 'Safe',
      inactiveValue: 'normal',
    });
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
