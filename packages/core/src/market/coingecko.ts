import type { AssetType, CurrencyCode, PricePoint, Quote } from '../types.ts';
import { CachedLoader, defaultFetch, fetchJson, type FetchFn, type KeyValueCache } from './http.ts';
import { RANGE_DAYS, type AssetRef, type AssetSearchResult, type Fundamentals, type HistoryRange, type MarketDataProvider } from './provider.ts';

/**
 * CoinGecko (API pública, sin clave): búsqueda, precio actual en USD e historia diaria del último
 * año. Exige mencionar la fuente («Datos de CoinGecko»). Límites de uso bajos: todo se guarda en caché.
 */

export const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

/** Días máximos de historia de la API pública. */
export const COINGECKO_MAX_DAYS = 365;

const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
const PRICE_TTL_MS = 2 * 60 * 1000;
const HISTORY_TTL_MS = 12 * 60 * 60 * 1000;

interface SearchResponse {
  coins?: { id?: string; name?: string; symbol?: string; market_cap_rank?: number | null; thumb?: string; large?: string }[];
}

type PriceResponse = Record<string, { usd?: number; usd_24h_change?: number | null } | undefined>;

interface ChartResponse {
  prices?: [number, number][];
}

const coinId = (providerId: string) => providerId.slice(providerId.indexOf(':') + 1);

export class CoinGeckoProvider implements MarketDataProvider {
  readonly id = 'coingecko';
  readonly prefixes = ['cg'] as const;
  readonly supports: readonly AssetType[] = ['crypto'];
  private readonly loader: CachedLoader;

  constructor(
    private readonly fetchFn: FetchFn = defaultFetch,
    cache?: KeyValueCache,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.loader = new CachedLoader(cache, () => this.now().getTime());
  }

  async search(query: string, limit = 20): Promise<AssetSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const data = await this.loader.get(`mkt:cg:search:${q}`, SEARCH_TTL_MS, () =>
      fetchJson<SearchResponse>(this.fetchFn, `${COINGECKO_BASE}/search?query=${encodeURIComponent(q)}`),
    );
    const upper = q.toUpperCase();
    return (data.coins ?? [])
      .filter((c) => c.id && c.symbol)
      .sort((a, b) => {
        // Primero el símbolo exacto; a igualdad, la de mayor capitalización.
        const exact = Number(b.symbol!.toUpperCase() === upper) - Number(a.symbol!.toUpperCase() === upper);
        return exact || (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9);
      })
      .slice(0, limit)
      .map((c) => ({
        providerId: `cg:${c.id}`,
        symbol: c.symbol!.toUpperCase(),
        name: c.name ?? c.symbol!.toUpperCase(),
        type: 'crypto' as const,
        currency: 'USD',
        logoUrl: c.large || c.thumb || undefined,
      }));
  }

  async getQuotes(assets: readonly AssetRef[]): Promise<Quote[]> {
    const ids = [...new Set(assets.map((a) => coinId(a.providerId)))].sort();
    if (ids.length === 0) return [];
    const data = await this.loader.get(`mkt:cg:price:${ids.join(',')}`, PRICE_TTL_MS, () =>
      fetchJson<PriceResponse>(
        this.fetchFn,
        `${COINGECKO_BASE}/simple/price?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=usd&include_24hr_change=true`,
      ),
    );
    const asOf = this.now().toISOString().slice(0, 10);
    const quotes: Quote[] = [];
    for (const a of assets) {
      const entry = data[coinId(a.providerId)];
      const price = entry?.usd;
      if (typeof price !== 'number' || !(price > 0)) continue;
      const change = entry?.usd_24h_change;
      quotes.push({
        assetId: a.providerId,
        price,
        previousClose: typeof change === 'number' && change > -100 ? price / (1 + change / 100) : undefined,
        currency: 'USD',
        asOf,
      });
    }
    return quotes;
  }

  async getHistory(asset: AssetRef, range: HistoryRange): Promise<PricePoint[]> {
    const id = coinId(asset.providerId);
    const days = Math.min(RANGE_DAYS[range], COINGECKO_MAX_DAYS);
    const data = await this.loader.get(`mkt:cg:chart:${id}:${days}`, HISTORY_TTL_MS, () =>
      fetchJson<ChartResponse>(this.fetchFn, `${COINGECKO_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=daily`),
    );
    // Un punto por día (el último informado).
    const byDate = new Map<string, number>();
    for (const [ms, price] of data.prices ?? []) {
      if (typeof ms === 'number' && typeof price === 'number' && price > 0) byDate.set(new Date(ms).toISOString().slice(0, 10), price);
    }
    return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, close]) => ({ date, close }));
  }

  async getFundamentals(): Promise<Fundamentals | null> {
    return null;
  }

  async getFxRates(): Promise<Record<CurrencyCode, number>> {
    return {};
  }
}
