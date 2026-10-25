import { sortTransactions } from './positions.ts';
import type { AssetType, CurrencyCode, FxLookup, PricePoint, Transaction } from './types.ts';

export type Period = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | '5Y' | 'ALL';

export const PERIODS: readonly Period[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'ALL'];

/** Días hábiles por año para anualizar: mercados tradicionales cotizan ~252 días, cripto 365. */
export function tradingDaysPerYear(type: AssetType): number {
  return type === 'crypto' ? 365 : 252;
}

/** Fecha (YYYY-MM-DD) de inicio de un período contado hacia atrás desde `end`. */
export function periodStart(period: Period, end: Date): string | undefined {
  const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  switch (period) {
    case '1D':
      d.setUTCDate(d.getUTCDate() - 1);
      break;
    case '1W':
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    case '1M':
      d.setUTCMonth(d.getUTCMonth() - 1);
      break;
    case '3M':
      d.setUTCMonth(d.getUTCMonth() - 3);
      break;
    case 'YTD':
      return `${end.getUTCFullYear() - 1}-12-31`;
    case '1Y':
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      break;
    case '5Y':
      d.setUTCFullYear(d.getUTCFullYear() - 5);
      break;
    case 'ALL':
      return undefined;
  }
  return d.toISOString().slice(0, 10);
}

/** Retornos simples entre observaciones consecutivas. */
export function simpleReturns(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const curr = values[i]!;
    if (prev > 0) out.push(curr / prev - 1);
  }
  return out;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

/** Desvío estándar muestral (n − 1). */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

/** Volatilidad anualizada: desvío de los retornos diarios × √(días por año). */
export function annualizedVolatility(dailyReturns: readonly number[], periodsPerYear = 252): number {
  return standardDeviation(dailyReturns) * Math.sqrt(periodsPerYear);
}

/** Máxima caída desde un pico, en tanto por uno (valor negativo o 0). */
export function maxDrawdown(values: readonly number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

/** Último punto con fecha menor o igual a `date` (la historia debe estar ordenada). */
export function pointAtOrBefore(history: readonly PricePoint[], date: string): PricePoint | undefined {
  let lo = 0;
  let hi = history.length - 1;
  let found: PricePoint | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = history[mid]!;
    if (p.date.slice(0, 10) <= date) {
      found = p;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Máxima distancia entre el inicio del período y el último cierre previo (feriados, fines de semana). */
const MAX_START_GAP_DAYS = 7;

/** Rendimiento del precio en el período (tanto por uno), o undefined si no hay datos suficientes. */
export function periodReturn(history: readonly PricePoint[], period: Period, end = new Date()): number | undefined {
  if (history.length < 2) return undefined;
  const last = history[history.length - 1]!;
  const start = periodStart(period, end);
  const first = start ? pointAtOrBefore(history, start) : history[0];
  if (!first || first.close <= 0 || first === last) return undefined;
  if (start && daysBetween(first.date, start) > MAX_START_GAP_DAYS) return undefined;
  return last.close / first.close - 1;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000;
}

export interface AssetStats {
  lastPrice?: number;
  returns: Partial<Record<Period, number>>;
  /** Volatilidad anualizada del último año. */
  volatility1Y: number;
  maxDrawdown1Y: number;
  high52w?: number;
  low52w?: number;
}

export function assetStats(
  history: readonly PricePoint[],
  type: AssetType,
  end = new Date(),
): AssetStats {
  const returns: Partial<Record<Period, number>> = {};
  for (const period of PERIODS) {
    const r = periodReturn(history, period, end);
    if (r !== undefined) returns[period] = r;
  }
  const start1Y = periodStart('1Y', end)!;
  const lastYear = history.filter((p) => p.date.slice(0, 10) >= start1Y).map((p) => p.close);
  return {
    lastPrice: history[history.length - 1]?.close,
    returns,
    volatility1Y: annualizedVolatility(simpleReturns(lastYear), tradingDaysPerYear(type)),
    maxDrawdown1Y: maxDrawdown(lastYear),
    high52w: lastYear.length ? Math.max(...lastYear) : undefined,
    low52w: lastYear.length ? Math.min(...lastYear) : undefined,
  };
}

export interface PortfolioPoint {
  date: string;
  /** Valor de mercado en moneda base. */
  value: number;
  /** Aportes netos acumulados (compras − ventas) en moneda base. */
  netInvested: number;
  /** Índice de rendimiento ponderado por tiempo (base 1). */
  index: number;
}

export interface PortfolioSeriesInput {
  transactions: readonly Transaction[];
  /** Historia de precios por activo, ordenada por fecha. */
  histories: ReadonlyMap<string, readonly PricePoint[]>;
  /** Moneda de cotización de cada activo. */
  currencies: ReadonlyMap<string, CurrencyCode>;
  baseCurrency: CurrencyCode;
  fx: FxLookup;
  /** Fechas (YYYY-MM-DD, ordenadas) en las que evaluar la cartera. */
  dates: readonly string[];
}

/**
 * Serie histórica del valor de la cartera y un índice de rendimiento ponderado por tiempo
 * (TWR), que neutraliza el efecto de los aportes y retiros para medir rendimiento y desvío.
 */
export function portfolioSeries(input: PortfolioSeriesInput): PortfolioPoint[] {
  const txs = sortTransactions(input.transactions);
  const quantities = new Map<string, number>();
  const points: PortfolioPoint[] = [];
  let txIndex = 0;
  let netInvested = 0;
  let index = 1;
  let prevValue = 0;

  const toBase = (amount: number, currency: CurrencyCode, date: string, txRate?: number) => {
    if (currency === input.baseCurrency) return amount;
    const rate = txRate ?? input.fx(currency, input.baseCurrency, date) ?? 1;
    return amount * rate;
  };

  for (const date of input.dates) {
    let flow = 0;
    while (txIndex < txs.length && txs[txIndex]!.date.slice(0, 10) <= date) {
      const tx = txs[txIndex++]!;
      const q = quantities.get(tx.assetId) ?? 0;
      const gross = tx.quantity * tx.price;
      switch (tx.type) {
        case 'buy':
        case 'deposit':
        case 'transfer_in':
          quantities.set(tx.assetId, q + tx.quantity);
          if (tx.type === 'buy' || tx.type === 'deposit') {
            const cash = toBase(gross + tx.fee, tx.currency, tx.date, tx.fxRate);
            flow += cash;
          }
          break;
        case 'sell':
        case 'withdraw':
        case 'transfer_out':
          quantities.set(tx.assetId, Math.max(0, q - tx.quantity));
          if (tx.type === 'sell' || tx.type === 'withdraw') {
            flow -= toBase(gross - tx.fee, tx.currency, tx.date, tx.fxRate);
          }
          break;
        case 'split':
          quantities.set(tx.assetId, q * tx.quantity);
          break;
        case 'dividend':
        case 'interest':
          // El cobro sale de la cartera: se trata como retiro para que sume al rendimiento.
          flow -= toBase((tx.amount ?? gross) - tx.fee, tx.currency, tx.date, tx.fxRate);
          break;
        case 'fee':
          flow += toBase((tx.amount ?? gross) + tx.fee, tx.currency, tx.date, tx.fxRate);
          break;
      }
    }
    netInvested += flow;

    let value = 0;
    for (const [assetId, qty] of quantities) {
      if (qty <= 0) continue;
      const history = input.histories.get(assetId);
      const point = history ? pointAtOrBefore(history, date) : undefined;
      if (!point) continue;
      value += toBase(qty * point.close, input.currencies.get(assetId) ?? input.baseCurrency, date);
    }

    // Rendimiento del día excluyendo flujos: (V_t − F_t) / V_{t−1} − 1
    if (prevValue > 0) {
      const r = (value - flow) / prevValue - 1;
      index *= 1 + r;
    }
    points.push({ date, value, netInvested, index });
    prevValue = value;
  }
  return points;
}

export interface PortfolioRisk {
  /** Volatilidad anualizada del rendimiento de la cartera. */
  volatility: number;
  /** Rendimiento ponderado por tiempo del período analizado. */
  twr: number;
  maxDrawdown: number;
}

/**
 * Riesgo de la cartera a partir de una serie diaria de calendario (ver `dailyDates`).
 * Se anualiza con 365 porque la serie incluye fines de semana: los días sin cotización
 * aportan retorno 0 y el lunes acumula la variación, por lo que la varianza total se conserva.
 */
export function portfolioRisk(points: readonly PortfolioPoint[], periodsPerYear = 365): PortfolioRisk {
  const active = points.filter((p) => p.value > 0);
  const indices = active.map((p) => p.index);
  const first = indices[0] ?? 1;
  const last = indices[indices.length - 1] ?? 1;
  return {
    volatility: annualizedVolatility(simpleReturns(indices), periodsPerYear),
    twr: first > 0 ? last / first - 1 : 0,
    maxDrawdown: maxDrawdown(indices),
  };
}

/** Fechas diarias (YYYY-MM-DD) entre `from` y `to`, ambas incluidas. */
export function dailyDates(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${to.slice(0, 10)}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
