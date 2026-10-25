import type { CurrencyCode } from '../types.ts';
import { MOCK_FX_PER_USD } from '../market/catalog.ts';
import {
  FX_VARIANTS,
  resolvePreferences,
  type FxPreferences,
  type UsdRates,
  type VariantCurrency,
} from './table.ts';

export interface VariantQuote {
  buy?: number;
  sell: number;
  updatedAt?: string;
}

export interface FxSnapshot {
  /** Fecha de publicación de las cotizaciones (YYYY-MM-DD). */
  date: string;
  /** Unidades de cada moneda por 1 USD, ya con las variantes elegidas aplicadas. */
  rates: UsdRates;
  /** Todas las cotizaciones de los mercados con varios dólares (Argentina, Venezuela). */
  variants: Partial<Record<VariantCurrency, Record<string, VariantQuote>>>;
  /** 'live' = fuentes públicas; 'fallback' = valores de referencia por falta de conexión. */
  source: 'live' | 'fallback';
}

/** Fuente de tipos de cambio. Toda cotización se expresa contra USD. */
export interface FxSource {
  latest(prefs?: FxPreferences): Promise<FxSnapshot>;
  /** Cotizaciones en las fechas pedidas (YYYY-MM-DD) para las monedas indicadas. */
  on(dates: readonly string[], currencies: readonly CurrencyCode[], prefs?: FxPreferences): Promise<Record<string, UsdRates>>;
}

/** Almacenamiento clave/valor para no repetir consultas (AsyncStorage en la app, Postgres en el servidor). */
export interface FxCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const FX_ENDPOINTS = {
  /** currency-api (fawazahmed0): +150 monedas, historia diaria desde marzo de 2024. */
  currencyApi: (date: string) => [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`,
  ],
  /** Frankfurter (BCE): ~30 monedas, historia desde 1999. Respaldo para fechas antiguas. */
  frankfurter: (date: string) => [`https://api.frankfurter.app/${date}?from=USD`],
  /** DolarAPI: cotizaciones actuales de cada tipo de dólar. */
  dolarApi: { ARS: 'https://dolarapi.com/v1/dolares', VES: 'https://ve.dolarapi.com/v1/dolares' } as Record<VariantCurrency, string>,
  /** ArgentinaDatos: historia diaria de cada tipo de dólar en Argentina. */
  argentinaDatos: (casa: string) => `https://api.argentinadatos.com/v1/cotizaciones/dolares/${casa}`,
};

const DAY_MS = 86_400_000;
const SERIES_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CONCURRENCY = 6;

function upperKeys(obj: Record<string, unknown>): UsdRates {
  const out: UsdRates = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n > 0) out[k.toUpperCase()] = n;
  }
  return out;
}

function pick(rates: UsdRates, currencies: readonly CurrencyCode[]): UsdRates {
  const out: UsdRates = {};
  for (const c of currencies) if (rates[c] !== undefined) out[c] = rates[c]!;
  return out;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Tipos de cambio desde fuentes públicas gratuitas y sin clave, con el dólar como puente.
 * Para Argentina y Venezuela aplica el tipo de dólar elegido por el usuario.
 */
export class PublicFxProvider implements FxSource {
  constructor(
    private readonly fetchFn: FetchFn = (url) => (globalThis as unknown as { fetch: FetchFn }).fetch(url),
    private readonly cache?: FxCache,
    private readonly today: () => Date = () => new Date(),
  ) {}

  private todayIso(): string {
    return this.today().toISOString().slice(0, 10);
  }

  private async fetchJson(urls: readonly string[]): Promise<unknown | null> {
    for (const url of urls) {
      try {
        const res = await this.fetchFn(url);
        if (res.ok) return await res.json();
      } catch {
        // Se prueba la siguiente URL.
      }
    }
    return null;
  }

  private async cached<T>(key: string, ttlMs: number | null, load: () => Promise<T | null>): Promise<T | null> {
    if (this.cache) {
      try {
        const raw = await this.cache.get(key);
        if (raw) {
          const entry = JSON.parse(raw) as { t: number; v: T };
          if (ttlMs === null || this.today().getTime() - entry.t < ttlMs) return entry.v;
        }
      } catch {
        // Caché inválida: se vuelve a consultar.
      }
    }
    const value = await load();
    if (value !== null && this.cache) {
      await this.cache.set(key, JSON.stringify({ t: this.today().getTime(), v: value })).catch(() => undefined);
    }
    return value;
  }

  /** Todas las monedas contra USD en una fecha (o 'latest'). */
  private async globalRates(date: string | 'latest'): Promise<{ date: string; rates: UsdRates } | null> {
    const load = async () => {
      const data = (await this.fetchJson(FX_ENDPOINTS.currencyApi(date))) as { date?: string; usd?: Record<string, unknown> } | null;
      if (data?.usd) return { date: data.date ?? (date === 'latest' ? this.todayIso() : date), rates: upperKeys(data.usd) };
      const ecb = (await this.fetchJson(FX_ENDPOINTS.frankfurter(date))) as { date?: string; rates?: Record<string, unknown> } | null;
      if (ecb?.rates) return { date: ecb.date ?? date, rates: { USD: 1, ...upperKeys(ecb.rates) } };
      return null;
    };
    // Las cotizaciones de días pasados no cambian: se guardan sin vencimiento.
    return date === 'latest' ? this.cached('fx:usd:latest', 60 * 60 * 1000, load) : this.cached(`fx:usd:${date}`, null, load);
  }

  /** Cotizaciones actuales de cada tipo de dólar de una moneda con varios mercados. */
  private async variantQuotes(currency: VariantCurrency): Promise<Record<string, VariantQuote> | null> {
    return this.cached(`fx:variants:${currency}`, 15 * 60 * 1000, async () => {
      const data = (await this.fetchJson([FX_ENDPOINTS.dolarApi[currency]])) as
        | { casa?: string; compra?: number | null; venta?: number | null; promedio?: number | null; fechaActualizacion?: string }[]
        | null;
      if (!Array.isArray(data)) return null;
      const out: Record<string, VariantQuote> = {};
      for (const item of data) {
        const sell = item.venta ?? item.promedio ?? item.compra;
        if (!item.casa || !sell) continue;
        out[item.casa] = { buy: item.compra ?? undefined, sell, updatedAt: item.fechaActualizacion };
      }
      return Object.keys(out).length ? out : null;
    });
  }

  /** Serie histórica diaria de un tipo de dólar argentino: fecha → pesos por dólar (venta). */
  private async argentinaSeries(casa: string): Promise<Record<string, number> | null> {
    return this.cached(`fx:ars:series:${casa}`, SERIES_TTL_MS, async () => {
      const data = (await this.fetchJson([FX_ENDPOINTS.argentinaDatos(casa)])) as
        | { fecha?: string; venta?: number | null; compra?: number | null }[]
        | null;
      if (!Array.isArray(data)) return null;
      const out: Record<string, number> = {};
      for (const row of data) {
        const v = row.venta ?? row.compra;
        if (row.fecha && v) out[row.fecha.slice(0, 10)] = v;
      }
      return Object.keys(out).length ? out : null;
    });
  }

  async latest(prefs?: FxPreferences): Promise<FxSnapshot> {
    const chosen = resolvePreferences(prefs);
    const global = await this.globalRates('latest');
    if (!global) {
      return { date: this.todayIso(), rates: { ...MOCK_FX_PER_USD }, variants: {}, source: 'fallback' };
    }
    const rates: UsdRates = { ...global.rates, USD: 1 };
    const variants: FxSnapshot['variants'] = {};
    for (const currency of Object.keys(FX_VARIANTS) as VariantCurrency[]) {
      const quotes = await this.variantQuotes(currency);
      if (!quotes) continue;
      variants[currency] = quotes;
      const selected = quotes[chosen[currency]];
      if (selected) rates[currency] = selected.sell;
    }
    return { date: global.date, rates, variants, source: 'live' };
  }

  async on(dates: readonly string[], currencies: readonly CurrencyCode[], prefs?: FxPreferences): Promise<Record<string, UsdRates>> {
    const chosen = resolvePreferences(prefs);
    const today = this.todayIso();
    const unique = [...new Set(dates.map((d) => d.slice(0, 10)))].filter((d) => d < today).sort();
    const wanted = [...new Set(currencies)].filter((c) => c !== 'USD');
    const out: Record<string, UsdRates> = {};
    if (unique.length === 0 || wanted.length === 0) return out;

    const globals = await mapLimit(unique, MAX_CONCURRENCY, (d) => this.globalRates(d));
    unique.forEach((d, i) => {
      const g = globals[i];
      if (g) out[d] = pick(g.rates, wanted);
    });

    // Argentina: se reemplaza por el tipo de dólar elegido, con su propia historia.
    if (wanted.includes('ARS')) {
      const series = await this.argentinaSeries(chosen.ARS);
      if (series) {
        const seriesDates = Object.keys(series).sort();
        for (const d of unique) {
          const value = valueAtOrBefore(series, seriesDates, d);
          if (value !== undefined) out[d] = { ...out[d], ARS: value };
        }
      }
    }
    return out;
  }
}

function valueAtOrBefore(series: Record<string, number>, sortedDates: readonly string[], date: string): number | undefined {
  let lo = 0;
  let hi = sortedDates.length - 1;
  let found: string | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDates[mid]! <= date) {
      found = sortedDates[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (!found) return undefined;
  // Si el último dato es de hace más de 10 días, no se considera representativo.
  if ((Date.parse(date) - Date.parse(found)) / DAY_MS > 10) return undefined;
  return series[found];
}

/** Fechas de muestreo semanales entre dos fechas (para series largas sin pedir cada día). */
export function weeklyDates(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  for (let t = Date.parse(`${from.slice(0, 10)}T00:00:00Z`); t <= end; t += 7 * DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  const last = to.slice(0, 10);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
