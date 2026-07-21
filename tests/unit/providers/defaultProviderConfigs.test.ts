import { getBuiltInProviderDefaultConfigs } from '@/providers/defaultProviderConfigs';

describe('getBuiltInProviderDefaultConfigs', () => {
  it('returns fresh built-in provider config objects', () => {
    const first = getBuiltInProviderDefaultConfigs();
    const second = getBuiltInProviderDefaultConfigs();

    expect(first).toHaveProperty('claude');
    expect(first).toHaveProperty('codex');
    expect(first).toHaveProperty('opencode');
    expect(first).toHaveProperty('typora');
    expect(first).not.toHaveProperty('pi');
    expect(first).not.toBe(second);
    expect(first.claude).not.toBe(second.claude);
    expect(first.codex).not.toBe(second.codex);
    expect(first.opencode).not.toBe(second.opencode);
    expect(first.typora).not.toBe(second.typora);
  });

  it('defaults Typora API on and CLI providers off', () => {
    const configs = getBuiltInProviderDefaultConfigs();

    expect(configs).toMatchObject({
      typora: { enabled: false },
      claude: { enabled: false },
      codex: { enabled: false },
      opencode: { enabled: false },
    });
  });
});
