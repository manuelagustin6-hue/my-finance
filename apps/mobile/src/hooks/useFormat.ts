import { formatMoney, formatNumber, formatPercent } from '@my-finance/core';
import { useMemo } from 'react';
import { numberLocale } from '@/i18n';
import { useTheme } from '@/theme';

/** Formateadores de números con la configuración regional del dispositivo. */
export function useFormat() {
  const c = useTheme();
  return useMemo(() => {
    const locale = numberLocale();
    return {
      money: (value: number, currency: string, compact = false) => formatMoney(value, currency, locale, compact),
      /** Monto con signo explícito (+/−), para resultados. */
      signedMoney: (value: number, currency: string) =>
        `${value > 0 ? '+' : ''}${formatMoney(value, currency, locale)}`,
      pct: (value: number, signed = true) => formatPercent(value, locale, signed),
      num: (value: number, decimals = 8) => formatNumber(value, locale, decimals),
      date: (iso: string) => {
        const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
        return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
      },
      /** Color según signo del resultado. */
      tone: (value: number) => (value > 0 ? c.positive : value < 0 ? c.negative : c.muted),
    };
  }, [c]);
}
