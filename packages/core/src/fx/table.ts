import type { CurrencyCode, FxLookup } from '../types.ts';
import { USD_PEGGED } from './currencies.ts';

/** Unidades de cada moneda por 1 USD. El dólar es la moneda puente de todas las conversiones. */
export type UsdRates = Record<CurrencyCode, number>;

/**
 * Mercados cambiarios con más de una cotización del dólar. Para cada moneda se elige
 * cuál usar en las conversiones (por ejemplo, el dólar MEP para valuar inversiones en Argentina).
 */
export const FX_VARIANTS = {
  ARS: ['bolsa', 'contadoconliqui', 'oficial', 'mayorista', 'blue', 'cripto', 'tarjeta'],
  VES: ['oficial', 'paralelo'],
} as const satisfies Record<string, readonly string[]>;

export type VariantCurrency = keyof typeof FX_VARIANTS;
export type FxVariantId<C extends VariantCurrency = VariantCurrency> = (typeof FX_VARIANTS)[C][number];
export type FxPreferences = Partial<{ [C in VariantCurrency]: FxVariantId<C> }>;

export const DEFAULT_FX_PREFERENCES: Required<FxPreferences> = { ARS: 'bolsa', VES: 'oficial' };

export function isVariantCurrency(code: string): code is VariantCurrency {
  return code in FX_VARIANTS;
}

export function resolvePreferences(prefs?: FxPreferences): Required<FxPreferences> {
  return { ...DEFAULT_FX_PREFERENCES, ...prefs };
}

/** Tipo de cambio entre dos monedas usando el dólar como puente: (B por USD) / (A por USD). */
export function crossRate(rates: UsdRates, from: CurrencyCode, to: CurrencyCode): number | undefined {
  if (from === to) return 1;
  const a = perUsd(rates, from);
  const b = perUsd(rates, to);
  if (a === undefined || b === undefined || a <= 0) return undefined;
  return b / a;
}

function perUsd(rates: UsdRates, code: CurrencyCode): number | undefined {
  return rates[code] ?? USD_PEGGED[code];
}

/**
 * Tabla de tipos de cambio por fecha, siempre contra USD. Para una fecha sin datos usa
 * la cotización publicada más reciente anterior (fines de semana y feriados).
 */
export class FxTable {
  private readonly dates: string[] = [];
  private readonly byDate = new Map<string, UsdRates>();

  constructor(
    private latest: UsdRates = {},
    history: Record<string, UsdRates> = {},
  ) {
    for (const [date, rates] of Object.entries(history)) this.add(date, rates);
  }

  add(date: string, rates: UsdRates): void {
    const d = date.slice(0, 10);
    const existing = this.byDate.get(d);
    if (existing) {
      Object.assign(existing, rates);
      return;
    }
    this.byDate.set(d, { ...rates });
    // Inserción ordenada.
    let i = this.dates.length;
    while (i > 0 && this.dates[i - 1]! > d) i--;
    this.dates.splice(i, 0, d);
  }

  setLatest(rates: UsdRates): void {
    this.latest = { ...rates };
  }

  /** Unidades de `code` por 1 USD en `date` (o las actuales si no se indica fecha). */
  perUsd(code: CurrencyCode, date?: string): number | undefined {
    const pegged = USD_PEGGED[code];
    if (pegged !== undefined && code !== 'USD' && this.latest[code] === undefined) return pegged;
    if (code === 'USD') return 1;
    if (date) {
      const d = date.slice(0, 10);
      // Búsqueda binaria de la última fecha <= d que tenga la moneda.
      let lo = 0;
      let hi = this.dates.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this.dates[mid]! <= d) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      for (let i = idx; i >= 0; i--) {
        const v = this.byDate.get(this.dates[i]!)?.[code];
        if (v !== undefined) return v;
      }
      // Fecha anterior a toda la historia: se usa el primer dato disponible.
      for (const day of this.dates) {
        const v = this.byDate.get(day)?.[code];
        if (v !== undefined) return v;
      }
    }
    return this.latest[code];
  }

  rate(from: CurrencyCode, to: CurrencyCode, date?: string): number | undefined {
    if (from === to) return 1;
    const a = this.perUsd(from, date);
    const b = this.perUsd(to, date);
    if (a === undefined || b === undefined || a <= 0) return undefined;
    return b / a;
  }

  /** Función de conversión para el motor de posiciones (usa la fecha de cada operación). */
  lookup(): FxLookup {
    return (from, to, date) => this.rate(from, to, date);
  }

  /** Conversión siempre con el tipo de cambio actual (para valuar a precios de hoy). */
  latestLookup(): FxLookup {
    return (from, to) => this.rate(from, to);
  }

  get historyDates(): readonly string[] {
    return this.dates;
  }
}
