import type { CurrencyCode } from './types.ts';

/** Monedas que Intl no reconoce como ISO 4217 (cripto, stablecoins). */
const NON_ISO_DECIMALS: Record<string, number> = { USDT: 2, USDC: 2, DAI: 2, BTC: 8, ETH: 6 };

export function formatMoney(value: number, currency: CurrencyCode, locale = 'es-AR', compact = false): string {
  if (!Number.isFinite(value)) return '—';
  if (currency in NON_ISO_DECIMALS) {
    const digits = NON_ISO_DECIMALS[currency]!;
    return `${formatNumber(value, locale, digits)} ${currency}`;
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : Math.abs(value) < 1 && value !== 0 ? 4 : 2,
    }).format(value);
  } catch {
    return `${formatNumber(value, locale, 2)} ${currency}`;
  }
}

export function formatNumber(value: number, locale = 'es-AR', maxDecimals = 8): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDecimals }).format(value);
}

/** Formatea un tanto por uno como porcentaje con signo (0.1234 → "+12,34 %"). */
export function formatPercent(value: number, locale = 'es-AR', signed = true): string {
  if (!Number.isFinite(value)) return '—';
  const text = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value);
  return text;
}
