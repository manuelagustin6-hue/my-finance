import type { AssetType, CurrencyCode, TransactionType } from '../types.ts';
import { isBlankRow, parseCsv, parseDate, parseNumber, rowsToRecords } from './parse.ts';
import { applySmartMapping, detectSmartMapping, type RowAction, type SmartImportResult } from './smart.ts';

/** Fila normalizada de una importación, previa a vincularla con un activo del catálogo. */
export interface ImportedRow {
  /** Número de línea en el archivo original (1 = encabezado). */
  line: number;
  date: string;
  type: TransactionType;
  symbol: string;
  assetType?: AssetType;
  quantity: number;
  price: number;
  amount?: number;
  fee: number;
  currency: CurrencyCode;
  externalId?: string;
  note?: string;
  /** Nombre o descripción del instrumento, si el archivo la trae. */
  name?: string;
}

export interface ImportIssue {
  line: number;
  message: string;
}

export interface ImportResult {
  templateId: TemplateId;
  rows: ImportedRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export type TemplateId = 'generic' | 'binance' | 'coinbase' | 'ibkr' | 'smart';

export interface ImportTemplate {
  id: TemplateId;
  name: string;
  description: string;
  /** Devuelve true si los encabezados corresponden a esta plantilla. */
  matches(headers: readonly string[]): boolean;
  parse(rows: string[][]): ImportResult;
}

/** Encabezados de la plantilla propia de la app. */
export const GENERIC_HEADERS = [
  'date',
  'type',
  'symbol',
  'asset_type',
  'quantity',
  'price',
  'fee',
  'currency',
  'amount',
  'note',
] as const;

export const GENERIC_TEMPLATE_EXAMPLE = [
  GENERIC_HEADERS.join(','),
  '2025-01-15,buy,AAPL,stock,10,185.20,1.00,USD,,',
  '2025-02-03,buy,BTC,crypto,0.05,98000,24.50,USD,,',
  '2025-03-10,dividend,AAPL,stock,,,0,USD,2.40,Dividendo trimestral',
  '2025-04-22,sell,AAPL,stock,4,201.10,1.00,USD,,',
].join('\n');

const TYPE_ALIASES: Record<string, TransactionType> = {
  buy: 'buy',
  compra: 'buy',
  sell: 'sell',
  venta: 'sell',
  deposit: 'deposit',
  deposito: 'deposit',
  depósito: 'deposit',
  withdraw: 'withdraw',
  withdrawal: 'withdraw',
  retiro: 'withdraw',
  transfer_in: 'transfer_in',
  transferencia_entrada: 'transfer_in',
  transfer_out: 'transfer_out',
  transferencia_salida: 'transfer_out',
  dividend: 'dividend',
  dividendo: 'dividend',
  interest: 'interest',
  interes: 'interest',
  interés: 'interest',
  coupon: 'interest',
  cupon: 'interest',
  cupón: 'interest',
  fee: 'fee',
  comision: 'fee',
  comisión: 'fee',
  split: 'split',
};

const ASSET_TYPE_ALIASES: Record<string, AssetType> = {
  crypto: 'crypto',
  cripto: 'crypto',
  stock: 'stock',
  accion: 'stock',
  acción: 'stock',
  cedear: 'stock',
  etf: 'etf',
  bond: 'bond',
  bono: 'bond',
  fund: 'fund',
  fondo: 'fund',
  fci: 'fund',
  cash: 'cash',
  efectivo: 'cash',
  other: 'other',
  otro: 'other',
};

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

function lower(headers: readonly string[]): string[] {
  return headers.map((h) => h.trim().toLowerCase());
}

/** Busca la fila de encabezados (algunos exportes traen líneas de texto antes). */
function findHeaderRow(rows: string[][], required: readonly string[]): number {
  return rows.findIndex((r) => {
    const l = lower(r);
    return required.every((h) => l.includes(h));
  });
}

function emptyResult(templateId: TemplateId): ImportResult {
  return { templateId, rows: [], errors: [], warnings: [] };
}

// ---------------------------------------------------------------------------
// Plantilla propia
// ---------------------------------------------------------------------------

export const genericTemplate: ImportTemplate = {
  id: 'generic',
  name: 'Plantilla de la app',
  description: 'Formato propio: date, type, symbol, asset_type, quantity, price, fee, currency, amount, note.',
  matches: (headers) => {
    const l = lower(headers);
    return ['date', 'type', 'symbol', 'quantity', 'price'].every((h) => l.includes(h));
  },
  parse(rows) {
    const result = emptyResult('generic');
    const { records } = rowsToRecords(rows.map((r, i) => (i === 0 ? r.map((h) => h.toLowerCase()) : r)));
    records.forEach((rec, i) => {
      if (!rec) return;
      const line = i + 2;
      const date = parseDate(rec.date);
      const type = TYPE_ALIASES[normalizeKey(rec.type ?? '')];
      const symbol = (rec.symbol ?? '').toUpperCase();
      if (!date) return result.errors.push({ line, message: `Fecha inválida: "${rec.date}"` });
      if (!type) return result.errors.push({ line, message: `Tipo de operación desconocido: "${rec.type}"` });
      if (!symbol) return result.errors.push({ line, message: 'Falta el símbolo del activo' });

      const quantity = parseNumber(rec.quantity);
      const price = parseNumber(rec.price);
      const amount = parseNumber(rec.amount);
      const fee = parseNumber(rec.fee);
      const isAmountType = type === 'dividend' || type === 'interest' || type === 'fee';
      if (isAmountType && !(amount >= 0)) {
        return result.errors.push({ line, message: 'Falta el monto (amount) del cobro o pago' });
      }
      if (!isAmountType && !(quantity > 0)) {
        return result.errors.push({ line, message: `Cantidad inválida: "${rec.quantity}"` });
      }
      if (!isAmountType && type !== 'split' && !(price >= 0)) {
        return result.errors.push({ line, message: `Precio inválido: "${rec.price}"` });
      }
      result.rows.push({
        line,
        date,
        type,
        symbol,
        assetType: ASSET_TYPE_ALIASES[normalizeKey(rec.asset_type ?? '')],
        quantity: isAmountType ? 0 : quantity,
        price: isAmountType || Number.isNaN(price) ? 0 : price,
        amount: isAmountType ? amount : undefined,
        fee: Number.isNaN(fee) ? 0 : Math.abs(fee),
        currency: (rec.currency || 'USD').toUpperCase(),
        note: rec.note || undefined,
      });
    });
    return result;
  },
};

// ---------------------------------------------------------------------------
// Binance (historial de operaciones spot)
// ---------------------------------------------------------------------------

const BINANCE_QUOTES = [
  'USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'DAI', 'USD', 'EUR', 'BRL', 'ARS', 'TRY', 'GBP',
  'BTC', 'ETH', 'BNB', 'SOL',
];

/** Separa un par de Binance ("BTCUSDT" o "BTC/USDT") en activo y moneda de cotización. */
export function splitPair(pair: string): { base: string; quote: string } | undefined {
  const p = pair.toUpperCase().replace(/[\s_-]/g, '');
  if (p.includes('/')) {
    const [base, quote] = p.split('/');
    return base && quote ? { base, quote } : undefined;
  }
  for (const q of BINANCE_QUOTES) {
    if (p.endsWith(q) && p.length > q.length) return { base: p.slice(0, -q.length), quote: q };
  }
  return undefined;
}

/** Separa "0.00120000BTC" en { value: 0.0012, unit: "BTC" }. */
function splitAmountUnit(raw: string): { value: number; unit?: string } {
  const m = /^\s*([-+]?[\d.,]+(?:[eE][-+]?\d+)?)\s*([A-Za-z]+)?\s*$/.exec(raw ?? '');
  if (!m) return { value: NaN };
  return { value: parseNumber(m[1]), unit: m[2]?.toUpperCase() };
}

export const binanceTemplate: ImportTemplate = {
  id: 'binance',
  name: 'Binance',
  description: 'Historial de operaciones spot exportado desde Binance (Órdenes → Historial de operaciones).',
  matches: (headers) => {
    const l = lower(headers);
    return l.includes('date(utc)') && (l.includes('pair') || l.includes('market'));
  },
  parse(rows) {
    const result = emptyResult('binance');
    const { records } = rowsToRecords(rows);
    records.forEach((rec, i) => {
      if (!rec) return;
      const line = i + 2;
      const get = (...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(rec).find((h) => h.toLowerCase() === k.toLowerCase());
          if (found && rec[found] !== '') return rec[found];
        }
        return undefined;
      };
      const date = parseDate(get('Date(UTC)'));
      const pair = splitPair(get('Pair', 'Market') ?? '');
      const side = (get('Side', 'Type') ?? '').toUpperCase();
      if (!date) return result.errors.push({ line, message: 'Fecha inválida' });
      if (!pair) return result.errors.push({ line, message: `No se reconoce el par "${get('Pair', 'Market')}"` });
      if (side !== 'BUY' && side !== 'SELL') {
        return result.errors.push({ line, message: `Lado de operación desconocido: "${side}"` });
      }
      const price = parseNumber(get('Price'));
      const qty = splitAmountUnit(get('Executed', 'Amount') ?? '').value;
      if (!(qty > 0) || !(price > 0)) return result.errors.push({ line, message: 'Cantidad o precio inválidos' });

      const feeRaw = splitAmountUnit(get('Fee') ?? '0');
      const feeCoin = (get('Fee Coin') ?? feeRaw.unit ?? pair.quote).toUpperCase();
      let fee = Number.isNaN(feeRaw.value) ? 0 : Math.abs(feeRaw.value);
      if (feeCoin === pair.base) {
        fee *= price;
      } else if (feeCoin !== pair.quote && fee > 0) {
        result.warnings.push({
          line,
          message: `La comisión se pagó en ${feeCoin}; no se puede convertir automáticamente y se registró en 0. Editala si querés incluirla.`,
        });
        fee = 0;
      }
      result.rows.push({
        line,
        date,
        type: side === 'BUY' ? 'buy' : 'sell',
        symbol: pair.base,
        assetType: 'crypto',
        quantity: qty,
        price,
        fee,
        currency: pair.quote,
      });
    });
    return result;
  },
};

// ---------------------------------------------------------------------------
// Coinbase (reporte de transacciones)
// ---------------------------------------------------------------------------

const COINBASE_TYPES: Record<string, TransactionType | 'skip'> = {
  buy: 'buy',
  'advanced trade buy': 'buy',
  sell: 'sell',
  'advanced trade sell': 'sell',
  receive: 'transfer_in',
  send: 'transfer_out',
  'rewards income': 'deposit',
  'staking income': 'deposit',
  'learning reward': 'deposit',
  'inflation reward': 'deposit',
  deposit: 'skip',
  withdrawal: 'skip',
  convert: 'skip',
};

export const coinbaseTemplate: ImportTemplate = {
  id: 'coinbase',
  name: 'Coinbase',
  description: 'Reporte de transacciones de Coinbase (Perfil → Estados de cuenta → Generar reporte CSV).',
  matches: (headers) => {
    const l = lower(headers);
    return l.includes('timestamp') && l.includes('transaction type') && l.includes('asset');
  },
  parse(rows) {
    const result = emptyResult('coinbase');
    const headerIndex = findHeaderRow(rows, ['timestamp', 'transaction type', 'asset']);
    if (headerIndex < 0) {
      result.errors.push({ line: 1, message: 'No se encontró el encabezado del reporte de Coinbase' });
      return result;
    }
    const { records } = rowsToRecords(rows.slice(headerIndex));
    records.forEach((rec, i) => {
      if (!rec) return;
      const line = headerIndex + i + 2;
      const get = (...keys: string[]) => {
        for (const k of keys) if (rec[k] !== undefined && rec[k] !== '') return rec[k];
        return undefined;
      };
      const kind = (get('Transaction Type') ?? '').toLowerCase();
      const type = COINBASE_TYPES[kind];
      if (!type) return result.warnings.push({ line, message: `Tipo "${kind}" no soportado; se omitió.` });
      if (type === 'skip') {
        if (kind === 'convert') {
          result.warnings.push({ line, message: 'Las conversiones se omiten: cargalas como una venta y una compra.' });
        }
        return;
      }
      const date = parseDate(get('Timestamp'));
      const symbol = (get('Asset') ?? '').toUpperCase();
      const quantity = Math.abs(parseNumber(get('Quantity Transacted')));
      const price = parseNumber(get('Spot Price at Transaction', 'Price at Transaction'));
      const fee = Math.abs(parseNumber(get('Fees and/or Spread', 'Fees')));
      const currency = (get('Spot Price Currency', 'Price Currency') ?? 'USD').toUpperCase();
      if (!date) return result.errors.push({ line, message: 'Fecha inválida' });
      if (!symbol || !(quantity > 0)) return result.errors.push({ line, message: 'Activo o cantidad inválidos' });
      if (type === 'transfer_in') {
        result.warnings.push({ line, message: 'Recepción: se tomó el precio del día como costo. Editalo si conocés el costo original.' });
      }
      result.rows.push({
        line,
        date,
        type,
        symbol,
        assetType: 'crypto',
        quantity,
        price: Number.isNaN(price) ? 0 : price,
        fee: Number.isNaN(fee) ? 0 : fee,
        currency,
        externalId: get('ID'),
        note: get('Notes'),
      });
    });
    return result;
  },
};

// ---------------------------------------------------------------------------
// Interactive Brokers (Flex Query de operaciones)
// ---------------------------------------------------------------------------

const IBKR_ASSET_CLASS: Record<string, AssetType> = {
  STK: 'stock',
  ETF: 'etf',
  BOND: 'bond',
  FUND: 'fund',
  CRYPTO: 'crypto',
  CASH: 'cash',
};

export const ibkrTemplate: ImportTemplate = {
  id: 'ibkr',
  name: 'Interactive Brokers',
  description:
    'Flex Query de operaciones (Trades) con las columnas Symbol, TradeDate, Quantity, TradePrice, IBCommission, CurrencyPrimary.',
  matches: (headers) => {
    const l = lower(headers);
    return l.includes('symbol') && l.includes('tradeprice') && (l.includes('tradedate') || l.includes('datetime'));
  },
  parse(rows) {
    const result = emptyResult('ibkr');
    const { records } = rowsToRecords(rows);
    records.forEach((rec, i) => {
      if (!rec) return;
      const line = i + 2;
      // Los Flex Query pueden repetir el encabezado entre secciones.
      if (rec.Symbol === 'Symbol') return;
      const date = parseDate(rec.TradeDate || rec.DateTime);
      const qtySigned = parseNumber(rec.Quantity);
      const price = parseNumber(rec.TradePrice);
      const fee = Math.abs(parseNumber(rec.IBCommission));
      const side = (rec['Buy/Sell'] ?? '').toUpperCase();
      if (!date) return result.errors.push({ line, message: 'Fecha inválida' });
      if (!rec.Symbol) return result.errors.push({ line, message: 'Falta el símbolo' });
      if (!Number.isFinite(qtySigned) || qtySigned === 0 || !(price >= 0)) {
        return result.errors.push({ line, message: 'Cantidad o precio inválidos' });
      }
      const assetClass = (rec.AssetClass ?? 'STK').toUpperCase();
      if (assetClass === 'OPT' || assetClass === 'FUT' || assetClass === 'FOP') {
        return result.warnings.push({ line, message: `Derivados (${assetClass}) aún no soportados; se omitió.` });
      }
      const isSell = side ? side.startsWith('SELL') : qtySigned < 0;
      result.rows.push({
        line,
        date,
        type: isSell ? 'sell' : 'buy',
        symbol: rec.Symbol.toUpperCase(),
        assetType: IBKR_ASSET_CLASS[assetClass] ?? 'other',
        quantity: Math.abs(qtySigned),
        price,
        fee: Number.isNaN(fee) ? 0 : fee,
        currency: (rec.CurrencyPrimary || rec.Currency || 'USD').toUpperCase(),
        externalId: rec.TradeID || rec.IBExecID || undefined,
      });
    });
    return result;
  },
};

export const IMPORT_TEMPLATES: readonly ImportTemplate[] = [genericTemplate, binanceTemplate, coinbaseTemplate, ibkrTemplate];

/** Detecta la plantilla según los encabezados (busca en las primeras filas). */
export function detectTemplate(rows: string[][]): ImportTemplate | undefined {
  for (const row of rows.slice(0, 15).filter((r) => !isBlankRow(r))) {
    const template = IMPORT_TEMPLATES.find((t) => t.matches(row));
    if (template) return template;
  }
  return undefined;
}

export interface ImportOptions {
  /** Acción elegida por el usuario para cada tipo de operación (importador inteligente). */
  actions?: Record<string, RowAction>;
  /** Moneda a usar si el archivo no la indica (normalmente la de la billetera). */
  defaultCurrency?: string;
}

/**
 * Interpreta un archivo CSV: usa la plantilla indicada, una conocida si coincide
 * (Binance, Coinbase, IBKR, plantilla de la app) o, si no, el importador inteligente.
 */
export function importCsv(text: string, templateId?: TemplateId, options: ImportOptions = {}): ImportResult | SmartImportResult {
  const rows = parseCsv(text);
  const template =
    templateId && templateId !== 'smart' ? IMPORT_TEMPLATES.find((t) => t.id === templateId) : templateId ? undefined : detectTemplate(rows);
  if (template) return template.parse(rows);

  const mapping = detectSmartMapping(rows);
  if (!mapping) {
    return {
      templateId: 'smart',
      rows: [],
      errors: [
        {
          line: 1,
          message: 'No se encontraron columnas de fecha, operación y activo. Revisa que el archivo tenga encabezados.',
        },
      ],
      warnings: [],
    };
  }
  mapping.actions = options.actions ?? {};
  return applySmartMapping(rows, mapping, options.defaultCurrency);
}

export function isSmartResult(result: ImportResult): result is SmartImportResult {
  return result.templateId === 'smart' && 'mapping' in result;
}

/** Huella para detectar operaciones duplicadas entre importaciones. */
export function transactionFingerprint(t: {
  date: string;
  type: string;
  symbol?: string;
  assetId?: string;
  quantity: number;
  price: number;
  amount?: number;
  externalId?: string;
}): string {
  if (t.externalId) return `ext:${t.externalId}`;
  const round = (n: number) => (Number.isFinite(n) ? n.toPrecision(10) : '0');
  return [t.date.slice(0, 19), t.type, t.assetId ?? t.symbol, round(t.quantity), round(t.price), round(t.amount ?? 0)].join('|');
}
