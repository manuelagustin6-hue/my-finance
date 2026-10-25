import { Platform } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Con Supabase configurado los datos se sincronizan en la nube; si no, la app funciona en modo demo local. */
export const isSupabaseConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

export const REVENUECAT_API_KEY =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }) ?? '';

export const isBillingConfigured = REVENUECAT_API_KEY !== '' && Platform.OS !== 'web';

/** Monedas base que se ofrecen al usuario. */
export const BASE_CURRENCIES = ['USD', 'EUR', 'ARS', 'BRL', 'MXN', 'CLP', 'COP', 'PEN', 'UYU', 'GBP', 'CHF', 'JPY', 'CAD'] as const;

export const TERMS_URL = 'https://example.com/terminos';
export const PRIVACY_URL = 'https://example.com/privacidad';
