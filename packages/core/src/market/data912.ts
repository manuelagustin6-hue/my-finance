import type { AssetType, CurrencyCode, PricePoint, Quote } from '../types.ts';
import { MOCK_CATALOG } from './catalog.ts';
import { CachedLoader, defaultFetch, fetchJson, type FetchFn, type KeyValueCache } from './http.ts';
import { RANGE_DAYS, type AssetRef, type AssetSearchResult, type Fundamentals, type HistoryRange, type MarketDataProvider } from './provider.ts';

/**
 * data912 (https://data912.com): paneles de BYMA (acciones, CEDEARs, bonos, letras, ONs) y de
 * EE. UU. (acciones y ADRs), más históricos diarios de BYMA. Gratis y sin clave, con unos 20 s de
 * demora. Se declara educativo y sin garantía: se usa para la beta, no para el lanzamiento pago.
 */

export const DATA912_BASE = 'https://data912.com';

type Market = 'ar' | 'us';
type Kind = 'stock' | 'cedear' | 'bond' | 'note' | 'corp' | 'us_stock' | 'adr';

interface PanelDef {
  id: string;
  market: Market;
  kind: Kind;
  type: AssetType;
  /** Unidades a las que corresponde el precio (bonos, letras y ONs: cada 100 nominales). */
  unit: number;
  /** Endpoint histórico de data912 (`/historical/{history}/{ticker}`), si existe. */
  history?: 'stocks' | 'cedears' | 'bonds';
}

export const DATA912_PANELS: readonly PanelDef[] = [
  { id: 'arg_stocks', market: 'ar', kind: 'stock', type: 'stock', unit: 1, history: 'stocks' },
  { id: 'arg_cedears', market: 'ar', kind: 'cedear', type: 'stock', unit: 1, history: 'cedears' },
  { id: 'arg_bonds', market: 'ar', kind: 'bond', type: 'bond', unit: 100, history: 'bonds' },
  { id: 'arg_notes', market: 'ar', kind: 'note', type: 'bond', unit: 100, history: 'bonds' },
  { id: 'arg_corp', market: 'ar', kind: 'corp', type: 'bond', unit: 100 },
  { id: 'usa_stocks', market: 'us', kind: 'us_stock', type: 'stock', unit: 1 },
  { id: 'usa_adrs', market: 'us', kind: 'adr', type: 'stock', unit: 1 },
];

const KIND_LABEL: Record<Kind, string> = {
  stock: 'Acción',
  cedear: 'CEDEAR',
  bond: 'Bono',
  note: 'Letra',
  corp: 'ON',
  us_stock: 'Acción EE. UU.',
  adr: 'ADR',
};

/** Fila de un panel en vivo, como la devuelve data912. */
export interface Data912PanelRow {
  symbol?: string | null;
  c?: number | null;
  px_bid?: number | null;
  px_ask?: number | null;
  pct_change?: number | null;
  v?: number | null;
}

/** Barra diaria de un histórico de data912. */
export interface Data912Bar {
  date?: string | null;
  c?: number | null;
}

/** Instrumento de un panel, ya normalizado. */
export interface Data912Instrument {
  providerId: string;
  symbol: string;
  name: string;
  panel: string;
  market: Market;
  type: AssetType;
  currency: CurrencyCode;
  unit: number;
  price?: number;
  previousClose?: number;
}

const PANEL_TTL_MS = 5 * 60 * 1000;
const HISTORY_TTL_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

const catalogBySymbol = new Map(MOCK_CATALOG.map((e) => [e.symbol, e]));

function finite(n: number | null | undefined): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Precio de una fila: último operado o, si no hubo operaciones, el punto medio de las puntas. */
export function panelPrice(row: Data912PanelRow): number | undefined {
  const last = finite(row.c);
  if (last !== undefined) return last;
  const bid = finite(row.px_bid);
  const ask = finite(row.px_ask);
  if (bid !== undefined && ask !== undefined) return (bid + ask) / 2;
  return bid ?? ask;
}

/** Normaliza un panel: moneda por sufijo (AL30D = AL30 en dólares), nombre y unidad. */
export function normalizePanel(panel: PanelDef, rows: readonly Data912PanelRow[]): Data912Instrument[] {
  const symbols = new Set(rows.map((r) => r.symbol?.trim().toUpperCase()).filter((s): s is string => !!s));
  const out: Data912Instrument[] = [];
  for (const row of rows) {
    const symbol = row.symbol?.trim().toUpperCase();
    if (!symbol) continue;
    let currency: CurrencyCode = panel.market === 'us' ? 'USD' : 'ARS';
    let base = symbol;
    // En BYMA la misma especie cotiza en pesos (AL30), dólar MEP (AL30D) y cable (AL30C).
    if (panel.market === 'ar' && /[DC]$/.test(symbol) && symbols.has(symbol.slice(0, -1))) {
      currency = 'USD';
      base = symbol.slice(0, -1);
    }
    const known = catalogBySymbol.get(base) ?? catalogBySymbol.get(symbol);
    const label = KIND_LABEL[panel.kind];
    const name = known && known.type === panel.type ? (panel.kind === 'cedear' ? `CEDEAR ${known.name}` : known.name) : `${label} ${base}`;
    const price = panelPrice(row);
    const pct = typeof row.pct_change === 'number' && Number.isFinite(row.pct_change) && row.pct_change > -100 ? row.pct_change : undefined;
    out.push({
      providerId: `${panel.market}:${symbol}`,
      symbol,
      name,
      panel: panel.id,
      market: panel.market,
      type: panel.type,
      currency,
      unit: panel.unit,
      price,
      previousClose: price !== undefined && pct !== undefined ? price / (1 + pct / 100) : undefined,
    });
  }
  return out;
}

export class Data912Provider implements MarketDataProvider {
  readonly id = 'data912';
  readonly prefixes = ['ar', 'us'] as const;
  readonly supports: readonly AssetType[] = ['stock', 'etf', 'bond'];
  private readonly loader: CachedLoader;

  constructor(
    private readonly fetchFn: FetchFn = defaultFetch,
    cache?: KeyValueCache,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.loader = new CachedLoader(cache, () => this.now().getTime());
  }

  private panel(def: PanelDef): Promise<Data912Instrument[]> {
    return this.loader.get(`mkt:d912:panel:${def.id}`, PANEL_TTL_MS, async () => {
      const rows = await fetchJson<Data912PanelRow[]>(this.fetchFn, `${DATA912_BASE}/live/${def.id}`);
      return normalizePanel(def, Array.isArray(rows) ? rows : []);
    });
  }

  /** Todos los instrumentos de los paneles pedidos; un panel caído no impide leer los demás. */
  private async instruments(markets: readonly Market[] = ['ar', 'us']): Promise<Data912Instrument[]> {
    const panels = DATA912_PANELS.filter((p) => markets.includes(p.market));
    const lists = await Promise.all(panels.map((p) => this.panel(p).catch(() => [] as Data912Instrument[])));
    return lists.flat();
  }

  async search(query: string, limit = 20): Promise<AssetSearchResult[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const all = await this.instruments();
    const scored: { item: Data912Instrument; score: number }[] = [];
    for (const item of all) {
      // Las variantes cable (C) solo aparecen si se las busca por su símbolo exacto.
      if (item.currency === 'USD' && item.market === 'ar' && item.symbol.endsWith('C') && item.symbol !== q) continue;
      const base = item.currency === 'USD' && item.market === 'ar' ? item.symbol.slice(0, -1) : item.symbol;
      let score = Infinity;
      if (item.symbol === q) score = 0;
      else if (base === q) score = 1;
      else if (item.symbol.startsWith(q)) score = 2;
      else if (item.name.toUpperCase().includes(q)) score = 3;
      if (score === Infinity) continue;
      // A igualdad, primero Argentina y la especie en pesos.
      scored.push({ item, score: score * 10 + (item.market === 'ar' ? 0 : 2) + (item.currency === 'USD' ? 1 : 0) });
    }
    return scored
      .sort((a, b) => a.score - b.score || a.item.symbol.localeCompare(b.item.symbol))
      .slice(0, limit)
      .map(({ item }) => ({
        providerId: item.providerId,
        symbol: item.symbol,
        name: item.name,
        type: item.type,
        currency: item.currency,
        exchange: item.market === 'ar' ? 'BYMA' : 'US',
        country: item.market === 'ar' ? 'AR' : 'US',
      }));
  }

  async getQuotes(assets: readonly AssetRef[]): Promise<Quote[]> {
    if (assets.length === 0) return [];
    const markets = [...new Set(assets.map((a) => a.providerId.split(':')[0] as Market))].filter((m) => m === 'ar' || m === 'us');
    const byId = new Map((await this.instruments(markets)).map((i) => [i.providerId, i]));
    const asOf = this.now().toISOString().slice(0, 10);
    const quotes: Quote[] = [];
    for (const a of assets) {
      const item = byId.get(a.providerId);
      if (!item || item.price === undefined) continue;
      quotes.push({
        assetId: a.providerId,
        price: item.price,
        previousClose: item.previousClose,
        currency: item.currency,
        ...(item.unit !== 1 ? { unit: item.unit } : {}),
        asOf,
      });
    }
    return quotes;
  }

  async getHistory(asset: AssetRef, range: HistoryRange): Promise<PricePoint[]> {
    const [market, symbol] = asset.providerId.split(':') as [Market, string | undefined];
    if (market !== 'ar' || !symbol) return [];
    const item = (await this.instruments(['ar'])).find((i) => i.providerId === asset.providerId);
    const def = DATA912_PANELS.find((p) => p.id === item?.panel) ?? DATA912_PANELS.find((p) => p.type === asset.type && p.market === 'ar');
    if (!def?.history) return [];
    // No todas las especies tienen histórico (p. ej. las variantes en dólares de CEDEARs): sin datos.
    // Se guarda compacto ([fecha, cierre]) para no ocupar espacio en el teléfono.
    const series = await this.loader
      .get(`mkt:d912:hist:${def.history}:${symbol}`, HISTORY_TTL_MS, async () => {
        const bars = await fetchJson<Data912Bar[]>(this.fetchFn, `${DATA912_BASE}/historical/${def.history}/${encodeURIComponent(symbol)}`);
        const out: [string, number][] = [];
        for (const bar of Array.isArray(bars) ? bars : []) {
          const date = bar.date?.slice(0, 10);
          const close = finite(bar.c);
          if (date && close !== undefined) out.push([date, close]);
        }
        return out.sort(([a], [b]) => a.localeCompare(b));
      })
      .catch(() => [] as [string, number][]);
    const from = new Date(this.now().getTime() - RANGE_DAYS[range] * DAY_MS).toISOString().slice(0, 10);
    return series
      .filter(([date]) => date >= from)
      .map(([date, close]) => (def.unit !== 1 ? { date, close, unit: def.unit } : { date, close }));
  }

  async getFundamentals(): Promise<Fundamentals | null> {
    return null;
  }

  async getFxRates(): Promise<Record<CurrencyCode, number>> {
    return {};
  }
}
