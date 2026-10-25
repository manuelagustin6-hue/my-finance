import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import es from './es';
import pt from './pt';

export const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

function deviceLanguage(): LanguageCode {
  const code = getLocales()[0]?.languageCode ?? 'es';
  return LANGUAGES.some((l) => l.code === code) ? (code as LanguageCode) : 'es';
}

/** Etiqueta regional del dispositivo (p. ej. es-AR) para formatear números y monedas. */
export function numberLocale(): string {
  return getLocales()[0]?.languageTag ?? 'es-AR';
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en }, pt: { translation: pt } },
  lng: deviceLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
