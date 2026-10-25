import {
  hasFeature,
  MockMarketDataProvider,
  PLANS,
  RANGE_DAYS,
  type AssetRef,
  type AssetSearchResult,
  type Feature,
  type Fundamentals,
  type HistoryRange,
  type PlanId,
  type PricePoint,
  type Quote,
} from '@my-finance/core';
import { getSupabase } from '@/lib/supabase';

/** La función pedida requiere el plan Pro. */
export class ProRequiredError extends Error {
  constructor(readonly feature: Feature) {
    super('PRO_REQUIRED');
    this.name = 'ProRequiredError';
  }
}

export interface MarketClient {
  search(query: string): Promise<AssetSearchResult[]>;
  quotes(assets: AssetRef[]): Promise<Quote[]>;
  history(asset: AssetRef, range: HistoryRange): Promise<PricePoint[]>;
  fundamentals(asset: AssetRef): Promise<Fundamentals | null>;
  /** Cuántas unidades de `base` vale 1 unidad de cada moneda. */
  fx(base: string, currencies: string[]): Promise<Record<string, number>>;
}

/** Cliente local con datos simulados (modo demo). Aplica los mismos límites que el servidor. */
export class LocalMarketClient implements MarketClient {
  private readonly provider = new MockMarketDataProvider();

  constructor(private readonly plan: () => PlanId) {}

  search(query: string) {
    return this.provider.search(query, 30);
  }

  quotes(assets: AssetRef[]) {
    return this.provider.getQuotes(assets);
  }

  history(asset: AssetRef, range: HistoryRange) {
    if (RANGE_DAYS[range] > PLANS[this.plan()].maxHistoryDays) {
      return Promise.reject(new ProRequiredError('full_price_history'));
    }
    return this.provider.getHistory(asset, range);
  }

  fundamentals(asset: AssetRef) {
    if (!hasFeature(this.plan(), 'fundamentals')) return Promise.reject(new ProRequiredError('fundamentals'));
    return this.provider.getFundamentals(asset);
  }

  fx(base: string, currencies: string[]) {
    return this.provider.getFxRates(base, currencies);
  }
}

/** Cliente que consulta la Edge Function `market` de Supabase. */
export class RemoteMarketClient implements MarketClient {
  async call<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await getSupabase().functions.invoke('market', { body });
    if (error) {
      const response = (error as { context?: Response }).context;
      if (response?.status === 402) {
        const payload = (await response.json().catch(() => ({}))) as { feature?: Feature };
        throw new ProRequiredError(payload.feature ?? 'portfolio_analytics');
      }
      throw error;
    }
    return data as T;
  }

  search(query: string) {
    return this.call<AssetSearchResult[]>({ action: 'search', query, limit: 30 });
  }

  quotes(assets: AssetRef[]) {
    if (assets.length === 0) return Promise.resolve([]);
    return this.call<Quote[]>({ action: 'quotes', assets });
  }

  history(asset: AssetRef, range: HistoryRange) {
    return this.call<PricePoint[]>({ action: 'history', asset, range });
  }

  fundamentals(asset: AssetRef) {
    return this.call<Fundamentals | null>({ action: 'fundamentals', asset });
  }

  fx(base: string, currencies: string[]) {
    return this.call<Record<string, number>>({ action: 'fx', base, currencies });
  }
}
