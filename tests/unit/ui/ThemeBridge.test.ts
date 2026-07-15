import { ThemeBridge } from '@/ui/ThemeBridge';

describe('ThemeBridge', () => {
  it('uses luminance rather than a host-specific theme class', () => {
    const bridge = new ThemeBridge() as unknown as { isDark(color: string): boolean };
    expect(bridge.isDark('rgb(20, 20, 20)')).toBe(true);
    expect(bridge.isDark('rgb(240, 240, 240)')).toBe(false);
  });
});
