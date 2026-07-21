import {
  getAvailableLocales,
  getLocale,
  getLocaleDisplayName,
  setLocale,
  t,
} from '@/i18n/i18n';
import type { Locale, TranslationKey } from '@/i18n/types';

describe('i18n', () => {
  beforeEach(() => {
    setLocale('en');
  });

  describe('t (translate)', () => {
    it('returns translated string for valid key', () => {
      const result = t('common.save' as TranslationKey);
      expect(result).toBe('Save');
    });

    it('returns string with parameter interpolation', () => {
      const result = t('chat.rewind.notice' as TranslationKey, { count: 2 });
      expect(result).toBe('Rewound: 2 file(s) reverted');
    });

    it('returns key for missing translation in English', () => {
      const result = t('nonexistent.key.here' as TranslationKey);
      expect(result).toBe('nonexistent.key.here');
    });

    it('falls back to English for missing translation in other locale', () => {
      setLocale('de');
      const result = t('common.save' as TranslationKey);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles nested keys correctly', () => {
      const result = t('settings.userName.name' as TranslationKey);
      expect(result).toBe('What should TyporAi call you?');
    });

    it('handles deeply nested keys', () => {
      const result = t('settings.userName.desc' as TranslationKey);
      expect(result).toBe('Your name for personalized greetings (leave empty for generic greetings)');
    });

    it('returns key when value is not a string', () => {
      const result = t('settings' as TranslationKey);
      expect(result).toBe('settings');
    });

    it('replaces placeholders with params', () => {
      const result = t('chat.fork.failed' as TranslationKey, { error: 'Network timeout' });
      expect(result).toBe('Fork failed: Network timeout');
    });

    it('keeps placeholder if param not provided', () => {
      const result = t('chat.rewind.notice' as TranslationKey, {});
      expect(result).toBe('Rewound: {count} file(s) reverted');
    });
  });

  describe('setLocale', () => {
    it('sets valid locale and returns true', () => {
      const result = setLocale('ja');
      expect(result).toBe(true);
      expect(getLocale()).toBe('ja');
    });

    it('sets Chinese Simplified locale', () => {
      const result = setLocale('zh-CN');
      expect(result).toBe(true);
      expect(getLocale()).toBe('zh-CN');
    });

    it('sets Chinese Traditional locale', () => {
      const result = setLocale('zh-TW');
      expect(result).toBe(true);
      expect(getLocale()).toBe('zh-TW');
    });

    it('returns false for invalid locale and keeps current', () => {
      setLocale('de');
      const result = setLocale('invalid' as Locale);
      expect(result).toBe(false);
      expect(getLocale()).toBe('de');
    });
  });

  describe('getLocale', () => {
    it('returns default locale initially', () => {
      expect(getLocale()).toBe('en');
    });

    it('returns current locale after change', () => {
      setLocale('fr');
      expect(getLocale()).toBe('fr');
    });
  });

  describe('getAvailableLocales', () => {
    it('returns all supported locales', () => {
      const locales = getAvailableLocales();

      expect(locales).toContain('en');
      expect(locales).toContain('zh-CN');
      expect(locales).toContain('zh-TW');
      expect(locales).toContain('ja');
      expect(locales).toContain('ko');
      expect(locales).toContain('de');
      expect(locales).toContain('fr');
      expect(locales).toContain('es');
      expect(locales).toContain('ru');
      expect(locales).toContain('pt');
    });

    it('returns exactly 10 locales', () => {
      const locales = getAvailableLocales();
      expect(locales).toHaveLength(10);
    });
  });

  describe('getLocaleDisplayName', () => {
    it('returns English for en', () => {
      expect(getLocaleDisplayName('en')).toBe('English');
    });

    it('returns Simplified Chinese name for zh-CN', () => {
      expect(getLocaleDisplayName('zh-CN')).toBe('简体中文');
    });

    it('returns Traditional Chinese name for zh-TW', () => {
      expect(getLocaleDisplayName('zh-TW')).toBe('繁體中文');
    });

    it('returns Japanese name for ja', () => {
      expect(getLocaleDisplayName('ja')).toBe('日本語');
    });

    it('returns Korean name for ko', () => {
      expect(getLocaleDisplayName('ko')).toBe('한국어');
    });

    it('returns German name for de', () => {
      expect(getLocaleDisplayName('de')).toBe('Deutsch');
    });

    it('returns French name for fr', () => {
      expect(getLocaleDisplayName('fr')).toBe('Français');
    });

    it('returns Spanish name for es', () => {
      expect(getLocaleDisplayName('es')).toBe('Español');
    });

    it('returns Russian name for ru', () => {
      expect(getLocaleDisplayName('ru')).toBe('Русский');
    });

    it('returns Portuguese name for pt', () => {
      expect(getLocaleDisplayName('pt')).toBe('Português');
    });

    it('returns locale code for unknown locale', () => {
      expect(getLocaleDisplayName('xx' as Locale)).toBe('xx');
    });
  });

  describe('translation in different locales', () => {
    it.each(['de', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW'] as Locale[])(
      'does not fall back to English across the settings surface in %s',
      locale => {
        const keys = [
          'settings.language.desc',
          'settings.claude.enableProvider.name',
          'settings.codex.enable.name',
          'settings.opencode.enable.name',
          'settings.typora.enable.name',
          'chat.toolbar.safeTooltip',
          'chat.toolbar.yoloTooltip',
        ] as TranslationKey[];

        setLocale('en');
        const english = keys.map(key => t(key));
        setLocale(locale);

        keys.forEach((key, index) => {
          expect(t(key)).not.toBe(english[index]);
        });
      },
    );

    it('translates correctly in German', () => {
      setLocale('de');
      const result = t('common.save' as TranslationKey);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('translates settings and provider pages correctly in Japanese', () => {
      setLocale('ja');
      expect(t('common.save' as TranslationKey)).toBe('保存');
      expect(t('settings.tabs.general' as TranslationKey)).toBe('一般');
      expect(t('settings.language.name' as TranslationKey)).toBe('言語');
      expect(t('settings.maxTabs.name' as TranslationKey)).toBe('チャットタブの最大数');
      expect(t('typora.settings.title' as TranslationKey)).toBe('設定');
      expect(t('settings.codex.enable.name' as TranslationKey)).not.toBe('Enable Codex provider');
      expect(t('settings.claude.enableProvider.name' as TranslationKey)).not.toBe('Enable Claude provider');
    });

    it('translates settings and provider pages correctly in Korean', () => {
      setLocale('ko');
      expect(t('common.save' as TranslationKey)).toBe('저장');
      expect(t('settings.tabs.general' as TranslationKey)).toBe('일반');
      expect(t('settings.language.name' as TranslationKey)).toBe('언어');
      expect(t('typora.settings.title' as TranslationKey)).toBe('설정');
      expect(t('settings.codex.enable.name' as TranslationKey)).not.toBe('Enable Codex provider');
      expect(t('settings.claude.enableProvider.name' as TranslationKey)).not.toBe('Enable Claude provider');
    });

    it('translates correctly in Simplified Chinese', () => {
      setLocale('zh-CN');
      const result = t('common.save' as TranslationKey);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('translates Simplified Chinese provider settings instead of falling back to English', () => {
      setLocale('zh-CN');

      expect(t('settings.codex.enable.name' as TranslationKey)).toBe('启用 Codex 提供商');
      expect(t('settings.codex.installationMethod.name' as TranslationKey)).toBe('安装方式');
      expect(t('settings.codex.cliPath.name' as TranslationKey)).toBe('Codex CLI 路径');
      expect(t('settings.codexSafeMode.name' as TranslationKey)).toBe('安全模式');
      expect(t('settings.customModels.name' as TranslationKey)).toBe('自定义模型');
      expect(t('settings.title' as TranslationKey)).toBe('TyporAi 设置');
      expect(t('settings.opencode.enable.name' as TranslationKey)).toBe('启用 OpenCode 提供商');
      expect(t('settings.opencode.models.heading' as TranslationKey)).toBe('模型');
      expect(t('settings.opencode.models.visible.name' as TranslationKey)).toBe('可见模型');
      expect(t('settings.opencode.models.emptyLoadFailed' as TranslationKey)).toBe(
        '从 OpenCode 加载模型失败。请检查 CLI 路径并重试。',
      );
      expect(t('settings.opencode.commands.heading' as TranslationKey)).toBe('命令');
      expect(t('settings.opencode.hiddenCommands.name' as TranslationKey)).toBe('隐藏的命令');
      expect(t('settings.typora.enable.name' as TranslationKey)).toBe('启用 API');
      expect(t('typora.settings.openAria' as TranslationKey)).toBe('打开 TyporAi 设置');
    });

    it('keeps provider, model, and platform names untransliterated in Simplified Chinese', () => {
      setLocale('zh-CN');
      expect(t('settings.codex.installationMethod.wsl' as TranslationKey)).toBe('WSL');
      expect(t('settings.codex.cliPath.placeholderWsl' as TranslationKey)).toBe('codex');
      expect(t('settings.codex.wslDistro.placeholder' as TranslationKey)).toBe('Ubuntu');
      expect(t('settings.subagents.modelOptions.sonnet' as TranslationKey)).toBe('Sonnet');
      expect(t('settings.subagents.modelOptions.opus' as TranslationKey)).toBe('Opus');
    });

    it('translates correctly in French', () => {
      setLocale('fr');
      const result = t('common.save' as TranslationKey);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('translates correctly in Spanish', () => {
      setLocale('es');
      const result = t('common.save' as TranslationKey);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('translates correctly in Russian', () => {
      setLocale('ru');
      const result = t('common.save' as TranslationKey);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('translates correctly in Portuguese', () => {
      setLocale('pt');
      const result = t('common.save' as TranslationKey);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
