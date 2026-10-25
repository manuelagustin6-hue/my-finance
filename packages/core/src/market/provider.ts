import type { AssetType, CurrencyCode, PricePoint, Quote } from '../types.ts';

export interface AssetRef {
  /** Identificador del activo en el proveedor (p. ej. "AAPL", "bitcoin"). */
  providerId: string;
  type: AssetType;
}

export interface AssetSearchResult {
  providerId: string;
  symbol: string;
  name: string;
  type: AssetType;
  currency: CurrencyCode;
  exchange?: string;
  country?: string;
  /** Logo informado por el proveedor de datos. */
  logoUrl?: string;
}

export type HistoryRange = '1M' | '3M' | '1Y' | '5Y' | 'MAX';

export interface FinancialStatementPeriod {
  /** Fin del período (YYYY-MM-DD). */
  period: string;
  /** "Q1 2025", "FY 2024", etc. */
  label: string;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash: number;
  totalDebt: number;
  operatingCashFlow: number;
  freeCashFlow: number;
}

export interface Filing {
  date: string;
  /** Tipo de presentación: 10-K, 10-Q, 20-F, estados contables trimestrales, etc. */
  form: string;
  title: string;
  url: string;
}

export interface Fundamentals {
  providerId: string;
  currency: CurrencyCode;
  description?: string;
  sector?: string;
  industry?: string;
  marketCap?: number;
  peRatio?: number;
  dividendYield?: number;
  beta?: number;
  /** Períodos más recientes primero. */
  statements: FinancialStatementPeriod[];
  filings: Filing[];
  /** true si los datos son simulados (proveedor de desarrollo). */
  simulated?: boolean;
}

/**
 * Contrato de cualquier fuente de datos de mercado. Cada proveedor real (cripto, acciones
 * globales, bonos locales…) implementa esta interfaz y se combina con `CompositeProvider`.
 */
export interface MarketDataProvider {
  readonly id: string;
  /** Tipos de activo que cubre el proveedor. */
  readonly supports: readonly AssetType[];
  search(query: string, limit?: number): Promise<AssetSearchResult[]>;
  getQuotes(assets: readonly AssetRef[]): Promise<Quote[]>;
  getHistory(asset: AssetRef, range: HistoryRange): Promise<PricePoint[]>;
  getFundamentals(asset: AssetRef): Promise<Fundamentals | null>;
  /** Cuántas unidades de `base` vale 1 unidad de cada moneda pedida. */
  getFxRates(base: CurrencyCode, currencies: readonly CurrencyCode[]): Promise<Record<CurrencyCode, number>>;
}

/** Delega en el primer proveedor que soporte el tipo de activo pedido. */
export class CompositeProvider implements MarketDataProvider {
  readonly id = 'composite';
  readonly supports: readonly AssetType[];

  constructor(
    private readonly providers: readonly MarketDataProvider[],
    private readonly fxProvider: MarketDataProvider = providers[0]!,
  ) {
    this.supports = [...new Set(providers.flatMap((p) => p.supports))];
  }

  private providerFor(type: AssetType): MarketDataProvider | undefined {
    return this.providers.find((p) => p.supports.includes(type));
  }

  async search(query: string, limit = 20): Promise<AssetSearchResult[]> {
    const results = await Promise.all(this.providers.map((p) => p.search(query, limit).catch(() => [])));
    return results.flat().slice(0, limit);
  }

  async getQuotes(assets: readonly AssetRef[]): Promise<Quote[]> {
    const groups = new Map<MarketDataProvider, AssetRef[]>();
    for (const a of assets) {
      const p = this.providerFor(a.type);
      if (!p) continue;
      groups.set(p, [...(groups.get(p) ?? []), a]);
    }
    const results = await Promise.all([...groups].map(([p, list]) => p.getQuotes(list).catch(() => [])));
    return results.flat();
  }

  async getHistory(asset: AssetRef, range: HistoryRange): Promise<PricePoint[]> {
    return (await this.providerFor(asset.type)?.getHistory(asset, range)) ?? [];
  }

  async getFundamentals(asset: AssetRef): Promise<Fundamentals | null> {
    return (await this.providerFor(asset.type)?.getFundamentals(asset)) ?? null;
  }

  getFxRates(base: CurrencyCode, currencies: readonly CurrencyCode[]) {
    return this.fxProvider.getFxRates(base, currencies);
  }
}

/** Días de calendario que abarca cada rango de historia. */
export const RANGE_DAYS: Record<HistoryRange, number> = {
  '1M': 31,
  '3M': 92,
  '1Y': 366,
  '5Y': 1827,
  MAX: 3653,
};
