import { averageCost, type Position } from './positions.ts';
import type { Asset, AssetType, CurrencyCode, FxLookup, Quote } from './types.ts';

export interface ValuedPosition extends Position {
  avgCost: number;
  /** Precio actual en la moneda del activo (undefined si no hay cotización). */
  price?: number;
  marketValue: number;
  marketValueBase: number;
  /** Resultado no realizado: valor de mercado − costo (comisiones incluidas). */
  unrealizedPnl: number;
  unrealizedPnlBase: number;
  /** Resultado no realizado sobre el costo, en tanto por uno (0.1 = 10 %). */
  unrealizedPnlPct: number;
  /** Resultado total: no realizado + realizado + dividendos/intereses, en moneda base. */
  totalPnlBase: number;
  /** Variación del día en moneda base. */
  dayChangeBase: number;
  dayChangePct: number;
  /** Peso en la cartera (0..1), se completa en summarizePortfolio. */
  weight: number;
  hasQuote: boolean;
}

export interface ValuationContext {
  baseCurrency: CurrencyCode;
  quotes: ReadonlyMap<string, Quote>;
  fx: FxLookup;
  assets?: ReadonlyMap<string, Asset>;
}

function currentFx(ctx: ValuationContext, from: CurrencyCode): number {
  if (from === ctx.baseCurrency) return 1;
  return ctx.fx(from, ctx.baseCurrency) ?? 1;
}

export function valuePosition(position: Position, ctx: ValuationContext): ValuedPosition {
  const asset = ctx.assets?.get(position.assetId);
  const quote = ctx.quotes.get(position.assetId);
  const price = quote?.price ?? asset?.manualPrice;
  const priceCurrency = quote?.currency ?? asset?.currency ?? position.currency;
  const fx = currentFx(ctx, priceCurrency);

  const hasQuote = price !== undefined;
  // Sin cotización se valoriza al costo para no distorsionar el total.
  const marketValue = hasQuote ? position.quantity * price : position.costBasis;
  const marketValueBase = hasQuote ? marketValue * fx : position.costBasisBase;

  const unrealizedPnl = marketValue - position.costBasis;
  const unrealizedPnlBase = marketValueBase - position.costBasisBase;
  const unrealizedPnlPct = position.costBasis > 0 ? unrealizedPnl / position.costBasis : 0;

  let dayChangeBase = 0;
  let dayChangePct = 0;
  if (hasQuote && quote?.previousClose && quote.previousClose > 0) {
    dayChangeBase = position.quantity * (quote.price - quote.previousClose) * fx;
    dayChangePct = quote.price / quote.previousClose - 1;
  }

  return {
    ...position,
    avgCost: averageCost(position),
    price,
    marketValue,
    marketValueBase,
    unrealizedPnl,
    unrealizedPnlBase,
    unrealizedPnlPct,
    totalPnlBase: unrealizedPnlBase + position.realizedPnlBase + position.incomeBase,
    dayChangeBase,
    dayChangePct,
    weight: 0,
    hasQuote,
  };
}

export interface AllocationSlice {
  key: string;
  value: number;
  weight: number;
}

export interface PortfolioSummary {
  baseCurrency: CurrencyCode;
  totalValue: number;
  totalCost: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number;
  income: number;
  feesPaid: number;
  totalPnl: number;
  dayChange: number;
  dayChangePct: number;
  /** Posiciones abiertas, ordenadas por valor de mercado descendente. */
  positions: ValuedPosition[];
  /** Posiciones cerradas (cantidad 0) con resultado realizado. */
  closedPositions: ValuedPosition[];
  byAssetType: AllocationSlice[];
  byCurrency: AllocationSlice[];
  byCountry: AllocationSlice[];
}

export function allocation<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  valueOf: (item: T) => number,
): AllocationSlice[] {
  const totals = new Map<string, number>();
  let total = 0;
  for (const item of items) {
    const value = valueOf(item);
    total += value;
    const key = keyOf(item);
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  return [...totals.entries()]
    .map(([key, value]) => ({ key, value, weight: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

/** Valoriza y resume posiciones (normalmente las consolidadas) en moneda base. */
export function summarizePortfolio(
  positions: readonly Position[],
  ctx: ValuationContext,
): PortfolioSummary {
  const valued = positions.map((p) => valuePosition(p, ctx));
  const open = valued.filter((p) => p.quantity > 0).sort((a, b) => b.marketValueBase - a.marketValueBase);
  const closed = valued.filter((p) => p.quantity <= 0);

  const totalValue = sum(open, (p) => p.marketValueBase);
  for (const p of open) p.weight = totalValue > 0 ? p.marketValueBase / totalValue : 0;

  const totalCost = sum(open, (p) => p.costBasisBase);
  const unrealizedPnl = sum(open, (p) => p.unrealizedPnlBase);
  const realizedPnl = sum(valued, (p) => p.realizedPnlBase);
  const income = sum(valued, (p) => p.incomeBase);
  const dayChange = sum(open, (p) => p.dayChangeBase);
  const previousValue = totalValue - dayChange;

  const assetType = (p: ValuedPosition): AssetType => ctx.assets?.get(p.assetId)?.type ?? 'other';
  const country = (p: ValuedPosition): string => ctx.assets?.get(p.assetId)?.country ?? '—';

  return {
    baseCurrency: ctx.baseCurrency,
    totalValue,
    totalCost,
    unrealizedPnl,
    unrealizedPnlPct: totalCost > 0 ? unrealizedPnl / totalCost : 0,
    realizedPnl,
    income,
    feesPaid: sum(valued, (p) => p.feesPaidBase),
    totalPnl: unrealizedPnl + realizedPnl + income,
    dayChange,
    dayChangePct: previousValue > 0 ? dayChange / previousValue : 0,
    positions: open,
    closedPositions: closed.filter((p) => p.transactionCount > 0),
    byAssetType: allocation(open, assetType, (p) => p.marketValueBase),
    byCurrency: allocation(open, (p) => p.currency, (p) => p.marketValueBase),
    byCountry: allocation(open, country, (p) => p.marketValueBase),
  };
}

function sum<T>(items: readonly T[], f: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += f(item);
  return total;
}
