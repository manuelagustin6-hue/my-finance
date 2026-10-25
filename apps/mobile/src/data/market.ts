import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hasFeature,
  MockMarketDataProvider,
  PublicFxProvider,
  type FxCache,
  type FxPreferences,
  type FxSnapshot,
  type UsdRates,
  canViewHistory,
  pointAtOrBefore,
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
  /** Precio de cierre en una fecha (o el último anterior), para valuar el saldo inicial. */
  priceOn(asset: AssetRef, date: string): Promise<PricePoint | null>;
  /** Tipos de cambio actuales contra USD (con el dólar elegido para ARS y VES). */
  fxLatest(prefs: FxPreferences): Promise<FxSnapshot>;
  /** Tipos de cambio contra USD en fechas pasadas. */
  fxOn(dates: string[], currencies: string[], prefs: FxPreferences): Promise<Record<string, UsdRates>>;
}

/** Caché local de cotizaciones (las de días pasados no cambian). */
const deviceFxCache: FxCache = {
  get: (key) => AsyncStorage.getItem(`my-finance:${key}`),
  set: (key, value) => AsyncStorage.setItem(`my-finance:${key}`, value),
};

/** Cliente local con datos simulados (modo demo). Aplica los mismos límites que el servidor. */
export class LocalMarketClient implements MarketClient {
  private readonly provider = new MockMarketDataProvider();
  /** Los tipos de cambio son reales también en modo demo: las fuentes son públicas y gratuitas. */
  private readonly fx = new PublicFxProvider(undefined, deviceFxCache);

  constructor(private readonly plan: () => PlanId) {}

  search(query: string) {
    return this.provider.search(query, 30);
  }

  quotes(assets: AssetRef[]) {
    return this.provider.getQuotes(assets);
  }

  history(asset: AssetRef, range: HistoryRange) {
    if (!canViewHistory(this.plan(), range)) {
      return Promise.reject(new ProRequiredError('full_price_history'));
    }
    return this.provider.getHistory(asset, range);
  }

  fundamentals(asset: AssetRef) {
    if (!hasFeature(this.plan(), 'fundamentals')) return Promise.reject(new ProRequiredError('fundamentals'));
    return this.provider.getFundamentals(asset);
  }

  async priceOn(asset: AssetRef, date: string) {
    return pointAtOrBefore(await this.provider.getHistory(asset, 'MAX'), date.slice(0, 10)) ?? null;
  }

  fxLatest(prefs: FxPreferences) {
    return this.fx.latest(prefs);
  }

  fxOn(dates: string[], currencies: string[], prefs: FxPreferences) {
    return this.fx.on(dates, currencies, prefs);
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

  priceOn(asset: AssetRef, date: string) {
    return this.call<PricePoint | null>({ action: 'price_on', asset, date });
  }

  fxLatest(prefs: FxPreferences) {
    return this.call<FxSnapshot>({ action: 'fx_latest', prefs });
  }

  fxOn(dates: string[], currencies: string[], prefs: FxPreferences) {
    if (dates.length === 0 || currencies.length === 0) return Promise.resolve({});
    return this.call<Record<string, UsdRates>>({ action: 'fx_on', dates, currencies, prefs });
  }
}
