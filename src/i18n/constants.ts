import type { Locale } from './types';

export interface LocaleInfo {
  code: Locale;
  name: string;
  englishName: string;
  flag?: string;
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', englishName: 'English', flag: '🇺🇸' },
  { code: 'zh-CN', name: '简体中文', englishName: 'Simplified Chinese', flag: '🇨🇳' },
  { code: 'zh-TW', name: '繁體中文', englishName: 'Traditional Chinese', flag: '🇹🇼' },
  { code: 'ja', name: '日本語', englishName: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', englishName: 'Korean', flag: '🇰🇷' },
  { code: 'de', name: 'Deutsch', englishName: 'German', flag: '🇩🇪' },
  { code: 'fr', name: 'Français', englishName: 'French', flag: '🇫🇷' },
  { code: 'es', name: 'Español', englishName: 'Spanish', flag: '🇪🇸' },
  { code: 'ru', name: 'Русский', englishName: 'Russian', flag: '🇷🇺' },
  { code: 'pt', name: 'Português', englishName: 'Portuguese', flag: '🇵🇹' },
];

export const DEFAULT_LOCALE: Locale = 'en';

export function getLocaleInfo(code: Locale): LocaleInfo | undefined {
  return SUPPORTED_LOCALES.find(locale => locale.code === code);
}

export function getLocaleDisplayString(code: Locale, includeFlag = true): string {
  const info = getLocaleInfo(code);
  if (!info) return code;

  return includeFlag && info.flag
    ? `${info.flag} ${info.name} (${info.englishName})`
    : `${info.name} (${info.englishName})`;
}
