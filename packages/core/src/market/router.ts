import type { AssetType, CurrencyCode, PricePoint, Quote } from '../types.ts';
import type { AssetRef, AssetSearchResult, Fundamentals, HistoryRange, MarketDataProvider } from './provider.ts';

/** Proveedor que atiende los `providerId` con ciertos prefijos (`ar:GGAL`, `cg:bitcoin`). */
export interface PrefixedProvider extends MarketDataProvider {
  readonly prefixes: readonly string[];
}

export const providerPrefix = (providerId: string): string | undefined => {
  const i = providerId.indexOf(':');
  return i > 0 ? providerId.slice(0, i) : undefined;
};

/**
 * Combina proveedores enrutando por el prefijo del `providerId` (no por tipo de activo: una acción
 * argentina y una de EE. UU. son ambas `stock`). Un proveedor caído no afecta a los demás.
 */
export class PrefixRouterProvider implements MarketDataProvider {
  readonly id = 'router';
  readonly supports: readonly AssetType[];
  private readonly byPrefix = new Map<string, PrefixedProvider>();

  constructor(private readonly providers: readonly PrefixedProvider[]) {
    for (const p of providers) for (const prefix of p.prefixes) this.byPrefix.set(prefix, p);
    this.supports = [...new Set(providers.flatMap((p) => p.supports))];
  }

  private providerOf(providerId: string): PrefixedProvider | undefined {
    const prefix = providerPrefix(providerId);
    return prefix ? this.byPrefix.get(prefix) : undefined;
  }

  async search(query: string, limit = 20): Promise<AssetSearchResult[]> {
    const q = query.trim().toUpperCase();
    const lists = await Promise.all(this.providers.map((p) => p.search(query, limit).catch(() => [] as AssetSearchResult[])));
    // Se intercalan los resultados y el símbolo exacto va primero, venga de donde venga.
    const merged: AssetSearchResult[] = [];
    for (let i = 0; merged.length < limit * lists.length && lists.some((l) => i < l.length); i++) {
      for (const list of lists) if (list[i]) merged.push(list[i]!);
    }
    const exact = merged.filter((r) => r.symbol.toUpperCase() === q);
    const rest = merged.filter((r) => r.symbol.toUpperCase() !== q);
    return [...exact, ...rest].slice(0, limit);
  }

  async getQuotes(assets: readonly AssetRef[]): Promise<Quote[]> {
    const groups = new Map<PrefixedProvider, AssetRef[]>();
    for (const a of assets) {
      const p = this.providerOf(a.providerId);
      if (p) groups.set(p, [...(groups.get(p) ?? []), a]);
    }
    const results = await Promise.all([...groups].map(([p, list]) => p.getQuotes(list).catch(() => [] as Quote[])));
    return results.flat();
  }

  async getHistory(asset: AssetRef, range: HistoryRange): Promise<PricePoint[]> {
    return (await this.providerOf(asset.providerId)?.getHistory(asset, range)) ?? [];
  }

  async getFundamentals(asset: AssetRef): Promise<Fundamentals | null> {
    return (await this.providerOf(asset.providerId)?.getFundamentals(asset)) ?? null;
  }

  async getFxRates(): Promise<Record<CurrencyCode, number>> {
    return {};
  }
}

/** Texto con el que el proveedor encuentra un id al buscar ("ar:GGAL" → "GGAL", "cg:bitcoin" → "bitcoin"). */
export const providerSearchTerm = (providerId: string): string => providerId.slice(providerId.indexOf(':') + 1);
