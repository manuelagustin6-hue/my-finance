import type { AssetType, CurrencyCode, TransactionType } from '../types.ts';
import { isBlankRow, parseDate } from './parse.ts';
import type { ImportedRow, ImportIssue, ImportResult } from './templates.ts';

/**
 * Importador inteligente: reconoce las columnas de cualquier CSV por su nombre (español,
 * inglés o portugués), detecta el formato de los números y clasifica cada tipo de operación.
 * El usuario puede revisar y cambiar la acción de cada tipo antes de importar.
 */

export type ColumnRole =
  | 'date'
  | 'type'
  | 'symbol'
  | 'instrument'
  | 'quantity'
  | 'price'
  | 'gross'
  | 'total'
  | 'fee'
  | 'currency'
  | 'id';

/** Qué hacer con las filas de un tipo de operación. */
export type RowAction = TransactionType | 'ignore';

export type NumberFormat = 'comma' | 'dot';

export interface SmartMapping {
  /** Índice de la fila de encabezados. */
  headerRow: number;
  headers: string[];
  /** Columnas asignadas a cada rol (las comisiones pueden ser varias). */
  columns: Partial<Record<ColumnRole, number[]>>;
  numberFormat: NumberFormat;
  /** Fechas como mes/día (formato de EE. UU.). */
  monthFirst: boolean;
  /** Acción por tipo de operación (clave normalizada). */
  actions: Record<string, RowAction>;
}

export interface TypeSummary {
  key: string;
  /** Texto original del tipo, como figura en el archivo. */
  label: string;
  count: number;
  action: RowAction;
  /** true si no se reconoció y se ignora por defecto. */
  unknown: boolean;
}

export interface SmartImportResult extends ImportResult {
  mapping: SmartMapping;
  types: TypeSummary[];
  /** Filas ignoradas por su tipo (movimientos de dinero, etc.). */
  ignored: number;
}

/** Sinónimos de encabezados por rol, en orden de preferencia (normalizados). */
const SYNONYMS: Record<ColumnRole, readonly string[]> = {
  id: ['nroticket', 'ticket', 'tradeid', 'transactionid', 'idoperacion', 'nrooperacion', 'id', 'nrocomprobante', 'comprobante'],
  date: ['fechaejecucion', 'fechaconcertacion', 'fechaoperacion', 'fechadeoperacion', 'fecha', 'tradedate', 'date', 'dateutc', 'datetime', 'timestamp', 'data', 'dataoperacao', 'datadonegocio'],
  type: ['tipooperacion', 'tipodeoperacion', 'tipodemovimiento', 'tipomovimiento', 'operacion', 'movimiento', 'tipo', 'concepto', 'transactiontype', 'type', 'side', 'action', 'buysell', 'operacao', 'movimentacao'],
  symbol: ['ticker', 'simbolo', 'symbol', 'codigo', 'codigodenegociacao', 'asset', 'activo', 'ativo', 'pair', 'market'],
  instrument: ['instrumento', 'especie', 'descripcion', 'titulo', 'description', 'instrument', 'name', 'nombre', 'produto', 'securitydescription'],
  quantity: ['cantidad', 'cantidadnominal', 'nominales', 'cantidadvn', 'quantity', 'qty', 'shares', 'units', 'quantidade', 'executed', 'quantitytransacted'],
  price: ['precio', 'preciounitario', 'cotizacion', 'price', 'tradeprice', 'preco', 'precounitario', 'priceattransaction', 'spotpriceattransaction'],
  gross: ['montobruto', 'importebruto', 'bruto', 'subtotal', 'gross', 'grossamount', 'valorbruto', 'importe', 'monto', 'amount', 'valor'],
  total: ['total', 'montoneto', 'importeneto', 'neto', 'net', 'netamount', 'nettotal', 'valorliquido', 'totalinclusiveoffeesandorspread'],
  currency: ['moneda', 'divisa', 'currency', 'moeda', 'currencyprimary', 'pricecurrency', 'spotpricecurrency'],
  fee: ['comision', 'comisiones', 'ddmm', 'derechosdemercado', 'derechos', 'iva', 'otros', 'gastos', 'arancel', 'aranceles', 'impuestos', 'fee', 'fees', 'feescomm', 'feesandcomm', 'commission', 'commissions', 'ibcommission', 'feesandorspread', 'taxa', 'taxas', 'corretagem', 'emolumentos'],
};

/** Orden de asignación: primero los roles más específicos. */
const ROLE_ORDER: readonly ColumnRole[] = ['id', 'date', 'type', 'symbol', 'instrument', 'quantity', 'price', 'gross', 'total', 'currency', 'fee'];

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeHeader(text: string): string {
  return normalizeText(text).replace(/[^a-z0-9]/g, '');
}

/** Asigna columnas a roles por sus encabezados. */
export function detectColumns(headers: readonly string[]): Partial<Record<ColumnRole, number[]>> {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const columns: Partial<Record<ColumnRole, number[]>> = {};

  for (const role of ROLE_ORDER) {
    const synonyms = SYNONYMS[role];
    if (role === 'fee') {
      const matches = norm
        .map((h, i) => ({ h, i }))
        .filter(({ h, i }) => !used.has(i) && synonyms.some((s) => h === s || (s.length >= 5 && h.includes(s))))
        .map(({ i }) => i);
      if (matches.length) columns.fee = matches;
      continue;
    }
    // Coincidencia exacta con el sinónimo de mayor prioridad; si no hay, inclusión (sinónimos largos).
    let best: { i: number; rank: number } | undefined;
    norm.forEach((h, i) => {
      if (used.has(i)) return;
      const exact = synonyms.indexOf(h);
      const partial = synonyms.findIndex((s) => s.length >= 5 && h.includes(s));
      const rank = exact >= 0 ? exact : partial >= 0 ? 100 + partial : -1;
      if (rank >= 0 && (!best || rank < best.rank)) best = { i, rank };
    });
    if (best) {
      columns[role] = [best.i];
      used.add(best.i);
    }
  }
  return columns;
}

/**
 * Formato que indica un número, o null si es ambiguo ("1.428" puede ser mil cuatrocientos
 * veintiocho o uno coma cuatro).
 */
function numberHint(raw: string): NumberFormat | null {
  const s = raw.trim().replace(/[^\d.,]/g, '');
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) return s.lastIndexOf(',') > s.lastIndexOf('.') ? 'comma' : 'dot';
  if (commas > 1) return 'dot';
  if (dots > 1) return 'comma';
  if (commas === 1) return s.length - s.indexOf(',') - 1 === 3 ? null : 'comma';
  if (dots === 1) return s.length - s.indexOf('.') - 1 === 3 ? null : 'dot';
  return null;
}

/** Detecta si los números usan coma decimal (1.234,56) o punto decimal (1,234.56). */
export function detectNumberFormat(cells: readonly string[]): NumberFormat {
  let comma = 0;
  let dot = 0;
  for (const raw of cells) {
    const hint = numberHint(raw);
    if (hint === 'comma') comma++;
    else if (hint === 'dot') dot++;
  }
  return comma > dot ? 'comma' : 'dot';
}

/** Detecta si las fechas con barras vienen como mes/día (EE. UU.) en lugar de día/mes. */
export function detectMonthFirst(cells: readonly string[]): boolean {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const raw of cells) {
    const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(raw);
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst++;
    else if (Number(m[2]) > 12) monthFirst++;
  }
  return monthFirst > dayFirst;
}

export function parseLocaleNumber(raw: string | undefined, format: NumberFormat): number {
  if (raw === undefined) return NaN;
  let s = raw.trim().replace(/[^\d.,\-+eE]/g, '');
  if (!s || s === '-' || s === '+') return NaN;
  s = format === 'comma' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Acción sugerida para un tipo de operación según palabras clave. */
export function classifyOperation(label: string): { action: RowAction; unknown: boolean } {
  const t = normalizeText(label);
  const rules: [RegExp, RowAction][] = [
    [/dividend.*especie|especie.*dividend|stock dividend|bonificacion/, 'transfer_in'],
    [/dividend|provento|rendimento distribuido/, 'dividend'],
    [/renta|amortiz|cupon|interes|coupon|interest|juros/, 'interest'],
    [/arancel|impuesto|gcias|ganancias|bienes personales|nota debito|comision|custodia|fee|tax|imposto|tarifa/, 'fee'],
    [/orden de pago|recibo de cobro|transferencia|conversion|deposito de fondos|retiro de fondos|ingreso de dinero|egreso de dinero|caucion|wire|withdrawal|deposit|resgate de saldo/, 'ignore'],
    [/split|desdoblamiento|desdobramento/, 'split'],
    [/venta|vende|vendid|sell|rescate|redemption|venda|resgate/, 'sell'],
    [/compra|buy|suscripcion|subscription|aplicacao/, 'buy'],
  ];
  for (const [re, action] of rules) if (re.test(t)) return { action, unknown: false };
  return { action: 'ignore', unknown: true };
}

/** Clave para agrupar tipos: texto normalizado y espacios simples. */
export function operationKey(label: string): string {
  return normalizeText(label).replace(/\s+/g, ' ');
}

/** Ticker entre paréntesis al final ("BONO ... (AL30)") o el texto si ya parece un ticker. */
export function extractSymbol(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const t = text.trim();
  const m = /\(([A-Za-z0-9.\-]{1,12})\)\s*$/.exec(t);
  if (m) return m[1]!.toUpperCase();
  if (/^[A-Z0-9][A-Z0-9.\-/]{0,11}$/.test(t)) return t.split('/')[0]!.toUpperCase();
  return undefined;
}

const CRYPTO = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'USDT', 'USDC', 'DAI', 'DOT', 'AVAX', 'LINK', 'MATIC', 'POL', 'LTC', 'TRX', 'TON', 'SHIB']);

/** Descripción sin el ticker final ni espacios repetidos ("BANCO BBVA ARG ESC (BBAR)" → "BANCO BBVA ARG ESC"). */
export function cleanName(description: string | undefined): string | undefined {
  const name = description?.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  return name || undefined;
}

/** Tipo de activo probable según la descripción. */
export function guessAssetType(symbol: string, description: string | undefined): AssetType | undefined {
  if (CRYPTO.has(symbol)) return 'crypto';
  const d = normalizeText(description ?? '');
  if (/\b(bono|bonos|letra|letras|lecap|boncer|obligacion|on|vrd|treasury|bond|tesouro)\b/.test(d)) return 'bond';
  if (/\b(fci|fondo|fondos|fund|etf)\b/.test(d)) return /\betf\b/.test(d) ? 'etf' : 'fund';
  if (/cedear|accion|acciones|ord\.|escrit|\besc\b|stock|share/.test(d)) return 'stock';
  return undefined;
}

/** Normaliza monedas escritas de distintas formas. */
export function normalizeCurrency(raw: string | undefined, fallback: CurrencyCode): CurrencyCode {
  const t = normalizeText(raw ?? '').replace(/[^a-z$]/g, '');
  if (!t) return fallback;
  if (['ext', 'usd', 'us$', 'u$s', 'dolar', 'dolares', 'dolarmep', 'mep', 'cable', 'usdc', 'ccl'].includes(t)) return 'USD';
  if (['$', 'ars', 'pesos', 'peso', 'pesosargentinos'].includes(t)) return 'ARS';
  if (/^[a-z]{3,5}$/.test(t)) return t.toUpperCase();
  return fallback;
}

/** Busca la fila de encabezados entre las primeras filas del archivo. */
export function detectSmartMapping(rows: string[][]): SmartMapping | null {
  const limit = Math.min(rows.length, 15);
  for (let r = 0; r < limit; r++) {
    const row = rows[r]!;
    if (isBlankRow(row)) continue;
    const columns = detectColumns(row);
    const hasCore = columns.date && (columns.type || columns.quantity) && (columns.symbol || columns.instrument || columns.type);
    if (!hasCore) continue;
    const numericCols = [...(columns.quantity ?? []), ...(columns.price ?? []), ...(columns.gross ?? []), ...(columns.total ?? []), ...(columns.fee ?? [])];
    const sample = rows.slice(r + 1, r + 200).flatMap((cells) => numericCols.map((i) => cells[i] ?? ''));
    const dates = rows.slice(r + 1, r + 200).map((cells) => cells[columns.date![0]!] ?? '');
    return {
      headerRow: r,
      headers: row.map((h) => h.trim()),
      columns,
      numberFormat: detectNumberFormat(sample),
      monthFirst: detectMonthFirst(dates),
      actions: {},
    };
  }
  return null;
}

/** Resumen de los tipos de operación del archivo con su acción (sugerida o elegida). */
export function summarizeTypes(rows: string[][], mapping: SmartMapping): TypeSummary[] {
  const typeCol = mapping.columns.type?.[0];
  const byKey = new Map<string, TypeSummary>();
  for (const cells of rows.slice(mapping.headerRow + 1)) {
    if (isBlankRow(cells)) continue;
    const label = typeCol !== undefined ? (cells[typeCol] ?? '').trim() : '';
    const key = operationKey(label || '(sin tipo)');
    const existing = byKey.get(key);
    if (existing) {
      existing.count++;
      continue;
    }
    const guess = label ? classifyOperation(label) : { action: 'buy' as RowAction, unknown: true };
    byKey.set(key, { key, label: label || '(sin tipo)', count: 1, action: mapping.actions[key] ?? guess.action, unknown: guess.unknown });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

const INCOME: readonly RowAction[] = ['dividend', 'interest', 'fee'];

/** Convierte las filas con el mapeo elegido. */
export function applySmartMapping(rows: string[][], mapping: SmartMapping, defaultCurrency: CurrencyCode = 'USD'): SmartImportResult {
  const types = summarizeTypes(rows, mapping);
  const actionOf = new Map(types.map((t) => [t.key, t.action]));
  const col = (role: ColumnRole) => mapping.columns[role]?.[0];
  const num = (cells: string[], role: ColumnRole) => {
    const i = col(role);
    return i === undefined ? NaN : parseLocaleNumber(cells[i], mapping.numberFormat);
  };
  const out: ImportedRow[] = [];
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  let ignored = 0;

  rows.slice(mapping.headerRow + 1).forEach((cells, idx) => {
    const line = mapping.headerRow + idx + 2;
    if (isBlankRow(cells)) return;
    const typeCol = col('type');
    const label = typeCol !== undefined ? (cells[typeCol] ?? '').trim() : '';
    const action = actionOf.get(operationKey(label || '(sin tipo)')) ?? 'ignore';
    if (action === 'ignore') {
      ignored++;
      return;
    }

    const date = parseDate(cells[col('date') ?? -1], mapping.monthFirst);
    if (!date) return errors.push({ line, message: `Fecha inválida: "${cells[col('date') ?? -1] ?? ''}"` });

    const currency = normalizeCurrency(cells[col('currency') ?? -1], defaultCurrency);
    const description = col('instrument') !== undefined ? cells[col('instrument')!]?.trim() : undefined;
    const rawSymbol = col('symbol') !== undefined ? cells[col('symbol')!]?.trim() : undefined;
    let symbol = extractSymbol(rawSymbol) ?? rawSymbol?.toUpperCase() ?? extractSymbol(description);

    const qty = Math.abs(num(cells, 'quantity'));
    const gross = Math.abs(num(cells, 'gross'));
    const total = Math.abs(num(cells, 'total'));
    const unitPrice = Math.abs(num(cells, 'price'));
    const fee = (mapping.columns.fee ?? []).reduce((sum, i) => {
      const v = parseLocaleNumber(cells[i], mapping.numberFormat);
      return sum + (Number.isFinite(v) ? Math.abs(v) : 0);
    }, 0);

    let assetType = symbol ? guessAssetType(symbol, description) : undefined;
    // Cobros y pagos sin activo (p. ej. dividendos en "Peso argentino"): se registran sobre el efectivo.
    if (!symbol && (INCOME.includes(action) || action === 'transfer_in' || action === 'deposit' || action === 'withdraw')) {
      symbol = currency;
      assetType = 'cash';
    }
    if (!symbol) return errors.push({ line, message: `No se encontró el activo de la operación "${label}".` });

    const note = [label, description].filter(Boolean).join(' · ') || undefined;
    const name = assetType === 'cash' ? undefined : cleanName(description);
    const externalId = col('id') !== undefined ? cells[col('id')!]?.trim() || undefined : undefined;

    if (INCOME.includes(action)) {
      // Comisiones sueltas: el total ya incluye impuestos; dividendos e intereses: bruto y gastos aparte.
      const amount = action === 'fee' ? total || gross : gross || total;
      if (!(amount > 0)) return errors.push({ line, message: 'Falta el monto de la operación.' });
      out.push({ line, date, type: action as TransactionType, symbol, assetType, quantity: 0, price: 0, amount, fee: action === 'fee' ? 0 : fee, currency, externalId, note, name });
      return;
    }

    if (!(qty > 0)) {
      if (assetType === 'cash' && (gross || total)) {
        out.push({ line, date, type: action as TransactionType, symbol, assetType, quantity: gross || total, price: 1, fee, currency, externalId, note, name });
        return;
      }
      return errors.push({ line, message: 'Cantidad inválida.' });
    }
    // Si el precio unitario coincide con el monto, se usa tal cual. Si no (bonos y ON cotizan
    // cada 100 nominales, fondos cada 1.000 cuotapartes), el precio efectivo sale del monto bruto.
    const hasUnit = Number.isFinite(unitPrice) && unitPrice > 0;
    const fromUnit = hasUnit ? qty * unitPrice : 0;
    const price =
      hasUnit && (!(gross > 0) || Math.abs(gross / fromUnit - 1) < 0.05) ? unitPrice : gross > 0 ? gross / qty : 0;
    if (action === 'transfer_in' && !(gross > 0)) {
      warnings.push({ line, message: `${symbol}: recibido sin costo (p. ej. dividendo en acciones).` });
    }
    out.push({ line, date, type: action as TransactionType, symbol, assetType, quantity: qty, price, fee: action === 'split' ? 0 : fee, currency, externalId, note, name });
  });

  return { templateId: 'smart', rows: out, errors, warnings, mapping, types, ignored };
}
