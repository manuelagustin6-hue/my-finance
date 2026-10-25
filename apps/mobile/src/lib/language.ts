import i18n, { LANGUAGES, type LanguageCode } from '@/i18n';

export function i18nLanguage(): LanguageCode {
  const lang = i18n.language as LanguageCode;
  return LANGUAGES.some((l) => l.code === lang) ? lang : 'es';
}

export function setLanguage(code: LanguageCode) {
  void i18n.changeLanguage(code);
}
