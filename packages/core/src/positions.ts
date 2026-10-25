import type { CurrencyCode, FxLookup, Transaction } from './types.ts';

/**
 * Posición de un activo, en una billetera o consolidada.
 * Método de costo: promedio ponderado. Las comisiones de compra se suman al costo y
 * las de venta se descuentan del ingreso, de modo que el P&L refleja lo que realmente
 * se pagó y se cobró.
 */
export interface Position {
  assetId: string;
  /** null en una posición consolidada de varias billeteras. */
  walletId: string | null;
  /** Moneda del activo (de sus operaciones). */
  currency: CurrencyCode;
  quantity: number;
  /** Costo de las unidades en cartera, comisiones incluidas, en la moneda del activo. */
  costBasis: number;
  /** Mismo costo convertido a moneda base con el tipo de cambio de cada operación. */
  costBasisBase: number;
  /** P&L realizado por ventas (neto de comisiones), en la moneda del activo. */
  realizedPnl: number;
  realizedPnlBase: number;
  /** Dividendos e intereses cobrados, netos de comisiones. */
  income: number;
  incomeBase: number;
  /** Total de comisiones pagadas (incluidas en costo y P&L, se informa aparte). */
  feesPaid: number;
  feesPaidBase: number;
  /** Total invertido en compras (comisiones incluidas). */
  totalInvested: number;
  totalInvestedBase: number;
  firstDate?: string;
  lastDate?: string;
  transactionCount: number;
}

export type PositionWarningCode = 'oversell' | 'missing_fx' | 'invalid_quantity' | 'currency_mismatch';

export interface PositionWarning {
  code: PositionWarningCode;
  transactionId: string;
  assetId: string;
  walletId: string;
  message: string;
}

export interface ComputePositionsOptions {
  baseCurrency: CurrencyCode;
  fx?: FxLookup;
  /**
   * Moneda de cotización de cada activo. Si una operación está en otra moneda (p. ej. un bono
   * comprado en pesos y vendido en dólares), sus montos se convierten a la moneda del activo
   * con el tipo de cambio de su fecha. Sin esto se usa la moneda de la primera operación.
   */
  assetCurrency?: (assetId: string) => CurrencyCode | undefined;
}

export interface ComputePositionsResult {
  /** Posiciones por activo y billetera. */
  byWallet: Position[];
  /** Posiciones consolidadas por activo (suma de todas las billeteras). */
  consolidated: Position[];
  warnings: PositionWarning[];
}

const EPSILON = 1e-10;

function emptyPosition(assetId: string, walletId: string | null, currency: CurrencyCode): Position {
  return {
    assetId,
    walletId,
    currency,
    quantity: 0,
    costBasis: 0,
    costBasisBase: 0,
    realizedPnl: 0,
    realizedPnlBase: 0,
    income: 0,
    incomeBase: 0,
    feesPaid: 0,
    feesPaidBase: 0,
    totalInvested: 0,
    totalInvestedBase: 0,
    transactionCount: 0,
  };
}

const INFLOWS: ReadonlySet<string> = new Set(['buy', 'deposit', 'transfer_in']);

/**
 * Ordena por fecha. En operaciones del mismo instante (por ejemplo, del mismo día cuando el
 * archivo no trae hora) procesa primero los ingresos de unidades y luego las salidas: así una
 * compra y venta del mismo día (operatoria MEP) no genera una venta sin tenencia. A igualdad,
 * respeta el orden original.
 */
export function sortTransactions<T extends Pick<Transaction, 'date'> & { type?: string }>(transactions: readonly T[]): T[] {
  const rank = (tx: T) => (tx.type && INFLOWS.has(tx.type) ? 0 : 1);
  return transactions
    .map((tx, index) => ({ tx, index }))
    .sort((a, b) =>
      a.tx.date < b.tx.date ? -1 : a.tx.date > b.tx.date ? 1 : rank(a.tx) - rank(b.tx) || a.index - b.index,
    )
    .map(({ tx }) => tx);
}

/**
 * Activos que se venden o retiran por más de lo que se compró en el conjunto de operaciones
 * (típico cuando el archivo no incluye la historia completa). Devuelve símbolo → faltante.
 */
export function missingHoldings<T extends Pick<Transaction, 'date' | 'type' | 'quantity'> & { key: string }>(
  rows: readonly T[],
): Map<string, number> {
  const held = new Map<string, number>();
  const missing = new Map<string, number>();
  for (const row of sortTransactions(rows)) {
    const q = held.get(row.key) ?? 0;
    if (INFLOWS.has(row.type)) held.set(row.key, q + row.quantity);
    else if (row.type === 'sell' || row.type === 'withdraw' || row.type === 'transfer_out') {
      if (row.quantity > q + 1e-9) missing.set(row.key, (missing.get(row.key) ?? 0) + row.quantity - q);
      held.set(row.key, Math.max(0, q - row.quantity));
    } else if (row.type === 'split') held.set(row.key, q * row.quantity);
  }
  return missing;
}

function resolveFx(
  tx: Transaction,
  options: ComputePositionsOptions,
  warnings: PositionWarning[],
): number {
  if (tx.currency === options.baseCurrency) return 1;
  if (tx.fxRate !== undefined && tx.fxRate > 0 && (!tx.fxBase || tx.fxBase === options.baseCurrency)) {
    return tx.fxRate;
  }
  const rate = options.fx?.(tx.currency, options.baseCurrency, tx.date);
  if (rate !== undefined && rate > 0) return rate;
  warnings.push({
    code: 'missing_fx',
    transactionId: tx.id,
    assetId: tx.assetId,
    walletId: tx.walletId,
    message: `No hay tipo de cambio ${tx.currency}/${options.baseCurrency} para ${tx.date}; se usó 1.`,
  });
  return 1;
}

/** Factor para pasar montos de la moneda de la operación a la moneda de la posición. */
function resolveConversion(
  tx: Transaction,
  pos: Position,
  options: ComputePositionsOptions,
  warnings: PositionWarning[],
): number {
  if (tx.currency === pos.currency) return 1;
  const rate = options.fx?.(tx.currency, pos.currency, tx.date);
  if (rate !== undefined && rate > 0) return rate;
  warnings.push({
    code: 'currency_mismatch',
    transactionId: tx.id,
    assetId: tx.assetId,
    walletId: tx.walletId,
    message: `La operación está en ${tx.currency} y el activo en ${pos.currency}, sin tipo de cambio para ${tx.date}.`,
  });
  return 1;
}

/**
 * Aplica una operación sobre una posición (muta la posición).
 * `fx` convierte a moneda base; `conv` convierte a la moneda de la posición.
 */
function applyTransaction(
  pos: Position,
  tx: Transaction,
  fx: number,
  conv: number,
  warnings: PositionWarning[],
): void {
  const fee = Math.max(0, tx.fee || 0);
  pos.transactionCount += 1;
  pos.firstDate = pos.firstDate ?? tx.date;
  pos.lastDate = tx.date;

  const warn = (code: PositionWarningCode, message: string) =>
    warnings.push({ code, transactionId: tx.id, assetId: tx.assetId, walletId: tx.walletId, message });

  switch (tx.type) {
    case 'buy':
    case 'deposit':
    case 'transfer_in': {
      if (!(tx.quantity > 0)) {
        warn('invalid_quantity', 'La cantidad debe ser mayor que cero.');
        return;
      }
      const cost = tx.quantity * tx.price + fee;
      pos.quantity += tx.quantity;
      pos.costBasis += cost * conv;
      pos.costBasisBase += cost * fx;
      pos.feesPaid += fee * conv;
      pos.feesPaidBase += fee * fx;
      if (tx.type === 'buy') {
        pos.totalInvested += cost * conv;
        pos.totalInvestedBase += cost * fx;
      }
      return;
    }

    case 'sell':
    case 'withdraw':
    case 'transfer_out': {
      if (!(tx.quantity > 0)) {
        warn('invalid_quantity', 'La cantidad debe ser mayor que cero.');
        return;
      }
      let quantity = tx.quantity;
      if (quantity > pos.quantity + EPSILON) {
        warn(
          'oversell',
          `Se intentó retirar ${tx.quantity} unidades pero solo había ${pos.quantity}; se ajustó a la tenencia.`,
        );
        quantity = pos.quantity;
      }
      const avgCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
      const avgCostBase = pos.quantity > 0 ? pos.costBasisBase / pos.quantity : 0;
      const costOut = avgCost * quantity;
      const costOutBase = avgCostBase * quantity;

      pos.quantity -= quantity;
      pos.costBasis -= costOut;
      pos.costBasisBase -= costOutBase;
      pos.feesPaid += fee * conv;
      pos.feesPaidBase += fee * fx;

      if (tx.type === 'sell') {
        const proceeds = quantity * tx.price - fee;
        pos.realizedPnl += proceeds * conv - costOut;
        pos.realizedPnlBase += proceeds * fx - costOutBase;
      } else {
        // En retiros y transferencias el costo viaja con las unidades; solo la comisión es pérdida.
        pos.realizedPnl -= fee * conv;
        pos.realizedPnlBase -= fee * fx;
      }

      if (Math.abs(pos.quantity) < EPSILON) {
        pos.quantity = 0;
        pos.costBasis = 0;
        pos.costBasisBase = 0;
      }
      return;
    }

    case 'dividend':
    case 'interest': {
      const amount = tx.amount ?? tx.quantity * tx.price;
      const net = amount - fee;
      pos.income += net * conv;
      pos.incomeBase += net * fx;
      pos.feesPaid += fee * conv;
      pos.feesPaidBase += fee * fx;
      return;
    }

    case 'fee': {
      const amount = (tx.amount ?? tx.quantity * tx.price) + fee;
      pos.realizedPnl -= amount * conv;
      pos.realizedPnlBase -= amount * fx;
      pos.feesPaid += amount * conv;
      pos.feesPaidBase += amount * fx;
      return;
    }

    case 'split': {
      if (!(tx.quantity > 0)) {
        warn('invalid_quantity', 'La relación del split debe ser mayor que cero.');
        return;
      }
      pos.quantity *= tx.quantity;
      return;
    }
  }
}

/** Calcula posiciones por billetera y consolidadas a partir del historial de operaciones. */
export function computePositions(
  transactions: readonly Transaction[],
  options: ComputePositionsOptions,
): ComputePositionsResult {
  const warnings: PositionWarning[] = [];
  const byKey = new Map<string, Position>();

  for (const tx of sortTransactions(transactions)) {
    const key = `${tx.assetId}::${tx.walletId}`;
    let pos = byKey.get(key);
    if (!pos) {
      pos = emptyPosition(tx.assetId, tx.walletId, options.assetCurrency?.(tx.assetId) ?? tx.currency);
      byKey.set(key, pos);
    }
    const fx = resolveFx(tx, options, warnings);
    applyTransaction(pos, tx, fx, resolveConversion(tx, pos, options, warnings), warnings);
  }

  const byWallet = [...byKey.values()];
  return { byWallet, consolidated: consolidatePositions(byWallet), warnings };
}

/** Suma posiciones del mismo activo en distintas billeteras. */
export function consolidatePositions(positions: readonly Position[]): Position[] {
  const byAsset = new Map<string, Position>();
  for (const p of positions) {
    const acc = byAsset.get(p.assetId);
    if (!acc) {
      byAsset.set(p.assetId, { ...p, walletId: null });
      continue;
    }
    acc.quantity += p.quantity;
    acc.costBasis += p.costBasis;
    acc.costBasisBase += p.costBasisBase;
    acc.realizedPnl += p.realizedPnl;
    acc.realizedPnlBase += p.realizedPnlBase;
    acc.income += p.income;
    acc.incomeBase += p.incomeBase;
    acc.feesPaid += p.feesPaid;
    acc.feesPaidBase += p.feesPaidBase;
    acc.totalInvested += p.totalInvested;
    acc.totalInvestedBase += p.totalInvestedBase;
    acc.transactionCount += p.transactionCount;
    if (p.firstDate && (!acc.firstDate || p.firstDate < acc.firstDate)) acc.firstDate = p.firstDate;
    if (p.lastDate && (!acc.lastDate || p.lastDate > acc.lastDate)) acc.lastDate = p.lastDate;
  }
  return [...byAsset.values()];
}

/** Costo promedio por unidad (comisiones incluidas). */
export function averageCost(position: Pick<Position, 'quantity' | 'costBasis'>): number {
  return position.quantity > 0 ? position.costBasis / position.quantity : 0;
}
