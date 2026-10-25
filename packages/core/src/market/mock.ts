import type { CurrencyCode, PricePoint, Quote } from '../types.ts';
import { MOCK_CATALOG, MOCK_FX_PER_USD, type CatalogEntry } from './catalog.ts';
import {
  RANGE_DAYS,
  type AssetRef,
  type AssetSearchResult,
  type FinancialStatementPeriod,
  type Fundamentals,
  type HistoryRange,
  type MarketDataProvider,
} from './provider.ts';

/** Fecha a partir de la cual se simula (hacia adelante y hacia atrás) cada serie de precios. */
const ANCHOR_DATE = '2026-01-02';
const DAY_MS = 86_400_000;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar determinística para (símbolo, fecha). */
function gaussian(symbol: string, date: string): number {
  const rand = mulberry32(hash(`${symbol}|${date}`));
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function trades24x7(entry: CatalogEntry): boolean {
  return entry.type === 'crypto' || entry.type === 'cash';
}

/**
 * Proveedor de datos simulados para desarrollo y demos. Genera series de precios
 * determinísticas (misma fecha → mismo precio) mediante un paseo aleatorio geométrico.
 */
export class MockMarketDataProvider implements MarketDataProvider {
  readonly id = 'mock';
  readonly supports = ['crypto', 'stock', 'etf', 'bond', 'fund', 'cash', 'other'] as const;
  private readonly bySymbol = new Map(MOCK_CATALOG.map((e) => [e.symbol, e]));
  private readonly seriesCache = new Map<string, { prices: Map<string, number>; min: string; max: string }>();

  constructor(private readonly today: () => Date = () => new Date()) {}

  entry(providerId: string): CatalogEntry | undefined {
    return this.bySymbol.get(providerId.toUpperCase());
  }

  private todayIso(): string {
    return this.today().toISOString().slice(0, 10);
  }

  /** Precio de cierre simulado en una fecha (sin cotización en fines de semana para mercados tradicionales). */
  private priceOn(entry: CatalogEntry, date: string): number {
    if (entry.volatility === 0) return entry.basePrice;
    let series = this.seriesCache.get(entry.symbol);
    if (!series) {
      series = { prices: new Map([[ANCHOR_DATE, entry.basePrice]]), min: ANCHOR_DATE, max: ANCHOR_DATE };
      this.seriesCache.set(entry.symbol, series);
    }
    const cached = series.prices.get(date);
    if (cached !== undefined) return cached;

    const periods = trades24x7(entry) ? 365 : 252;
    const sigma = entry.volatility / Math.sqrt(periods);
    const mu = entry.drift / periods - (sigma * sigma) / 2;
    const step = (d: string) => (trades24x7(entry) || !isWeekend(d) ? mu + sigma * gaussian(entry.symbol, d) : 0);

    // La serie se extiende desde sus extremos ya calculados, así cada fecha se calcula una sola vez.
    while (date > series.max) {
      const next = addDays(series.max, 1);
      series.prices.set(next, series.prices.get(series.max)! * Math.exp(step(next)));
      series.max = next;
    }
    while (date < series.min) {
      const prev = addDays(series.min, -1);
      series.prices.set(prev, series.prices.get(series.min)! / Math.exp(step(series.min)));
      series.min = prev;
    }
    return series.prices.get(date)!;
  }

  private lastTradingDay(entry: CatalogEntry, date: string): string {
    let d = date;
    while (!trades24x7(entry) && isWeekend(d)) d = addDays(d, -1);
    return d;
  }

  async search(query: string, limit = 20): Promise<AssetSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return MOCK_CATALOG.filter((e) => e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.symbol.toLowerCase() === q) - Number(a.symbol.toLowerCase() === q))
      .slice(0, limit)
      .map((e) => ({
        providerId: e.symbol,
        symbol: e.symbol,
        name: e.name,
        type: e.type,
        currency: e.currency,
        exchange: e.exchange,
        country: e.country,
      }));
  }

  async getQuotes(assets: readonly AssetRef[]): Promise<Quote[]> {
    const today = this.todayIso();
    const quotes: Quote[] = [];
    for (const a of assets) {
      const entry = this.entry(a.providerId);
      if (!entry) continue;
      const last = this.lastTradingDay(entry, today);
      const prev = this.lastTradingDay(entry, addDays(last, -1));
      quotes.push({
        assetId: a.providerId,
        price: this.priceOn(entry, last),
        previousClose: this.priceOn(entry, prev),
        currency: entry.currency,
        unit: entry.quoteUnit,
        asOf: last,
      });
    }
    return quotes;
  }

  async getHistory(asset: AssetRef, range: HistoryRange): Promise<PricePoint[]> {
    const entry = this.entry(asset.providerId);
    if (!entry) return [];
    const today = this.todayIso();
    const points: PricePoint[] = [];
    for (let i = RANGE_DAYS[range]; i >= 0; i--) {
      const date = addDays(today, -i);
      if (!trades24x7(entry) && isWeekend(date)) continue;
      points.push(entry.quoteUnit ? { date, close: this.priceOn(entry, date), unit: entry.quoteUnit } : { date, close: this.priceOn(entry, date) });
    }
    return points;
  }

  async getFundamentals(asset: AssetRef): Promise<Fundamentals | null> {
    const entry = this.entry(asset.providerId);
    if (!entry || entry.type !== 'stock') return null;
    const rand = mulberry32(hash(`fund|${entry.symbol}`));
    const marketCap = (entry.marketCapM ?? 10000) * 1e6;
    const pe = 12 + rand() * 25;
    const annualNetIncome = marketCap / pe;
    const netMargin = 0.08 + rand() * 0.22;
    const annualRevenue = annualNetIncome / netMargin;
    const shares = marketCap / entry.basePrice;

    const statements: FinancialStatementPeriod[] = [];
    const now = this.today();
    // Último trimestre cerrado con al menos ~45 días para su presentación.
    const ref = new Date(now.getTime() - 45 * DAY_MS);
    let year = ref.getUTCFullYear();
    let quarter = Math.floor(ref.getUTCMonth() / 3); // trimestre en curso (0..3) → el cerrado es el anterior
    for (let i = 0; i < 8; i++) {
      if (quarter === 0) {
        quarter = 4;
        year -= 1;
      }
      const growth = 1 + (rand() - 0.35) * 0.08;
      const revenue = (annualRevenue / 4) * growth * (1 - i * 0.015);
      const netIncome = revenue * netMargin * (0.85 + rand() * 0.3);
      const totalAssets = annualRevenue * (1.2 + rand() * 0.6);
      const totalLiabilities = totalAssets * (0.4 + rand() * 0.3);
      const endMonth = quarter * 3;
      const period = new Date(Date.UTC(year, endMonth, 0)).toISOString().slice(0, 10);
      const ocf = netIncome * (1.1 + rand() * 0.3);
      statements.push({
        period,
        label: `T${quarter} ${year}`,
        revenue,
        grossProfit: revenue * (0.35 + rand() * 0.3),
        operatingIncome: netIncome * 1.25,
        netIncome,
        eps: netIncome / shares,
        totalAssets,
        totalLiabilities,
        totalEquity: totalAssets - totalLiabilities,
        cash: totalAssets * (0.08 + rand() * 0.1),
        totalDebt: totalLiabilities * (0.3 + rand() * 0.3),
        operatingCashFlow: ocf,
        freeCashFlow: ocf * (0.6 + rand() * 0.3),
      });
      quarter -= 1;
    }

    return {
      providerId: entry.symbol,
      currency: entry.currency,
      description: `${entry.name} cotiza en ${entry.exchange ?? 'su mercado local'}. Datos financieros simulados para desarrollo.`,
      sector: entry.sector,
      marketCap,
      peRatio: pe,
      dividendYield: rand() < 0.6 ? rand() * 0.04 : 0,
      beta: 0.6 + rand() * 1.0,
      statements,
      filings: statements.slice(0, 4).map((s) => ({
        date: addDays(s.period, 40),
        form: entry.country === 'US' ? (s.label.startsWith('T4') ? '10-K' : '10-Q') : 'Estados contables',
        title: `Estados financieros ${s.label}`,
        url: filingsUrl(entry),
      })),
      simulated: true,
    };
  }

  async getFxRates(base: CurrencyCode, currencies: readonly CurrencyCode[]): Promise<Record<CurrencyCode, number>> {
    const basePerUsd = MOCK_FX_PER_USD[base];
    const out: Record<CurrencyCode, number> = {};
    if (basePerUsd === undefined) return out;
    for (const c of currencies) {
      const perUsd = MOCK_FX_PER_USD[c];
      if (perUsd !== undefined) out[c] = basePerUsd / perUsd;
    }
    return out;
  }
}

/** Sitio oficial donde consultar las presentaciones del emisor según su país. */
export function filingsUrl(entry: Pick<CatalogEntry, 'symbol' | 'country'>): string {
  switch (entry.country) {
    case 'US':
      return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(entry.symbol)}&type=10-&dateb=&owner=include&count=40`;
    case 'AR':
      return 'https://www.cnv.gov.ar/SitioWeb/Empresas/Empresas';
    case 'BR':
      return 'https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx';
    case 'MX':
      return 'https://www.bmv.com.mx/es/emisoras/informacionfinanciera';
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(`${entry.symbol} investor relations`)}`;
  }
}
