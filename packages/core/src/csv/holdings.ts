import type { AssetType, CurrencyCode } from '../types.ts';
import { isBlankRow, parseCsv } from './parse.ts';
import {
  cleanName,
  numberHint,
  extractSymbol,
  guessAssetType,
  normalizeCurrency,
  normalizeText,
  parseLocaleNumber,
  type NumberFormat,
  type SmartImportResult,
} from './smart.ts';
import { importCsv, isSmartResult, type ImportIssue, type ImportOptions, type ImportResult } from './templates.ts';

/**
 * Tenencias: una tabla con la cartera a una fecha ("Mi cartera", "Tenencia valorizada", "Holdings")
 * —activo, cantidad y, si hay, costo y valor— que se carga como saldo inicial de la billetera.
 */

export type HoldingRole = 'symbol' | 'instrument' | 'unitCost' | 'costTotal' | 'value' | 'price' | 'quantity' | 'currency';

const HOLDING_SYNONYMS: Record<HoldingRole, readonly string[]> = {
  symbol: ['ticker', 'simbolo', 'symbol', 'codigo', 'activo', 'asset', 'ativo', 'coin', 'codigodenegociacao'],
  instrument: ['instrumento', 'especie', 'descripcion', 'nombre', 'name', 'nome', 'description', 'titulo', 'producto', 'produto', 'security', 'securitydescription'],
  unitCost: [
    'ppc', 'preciopromediodecompra', 'preciopromedio', 'precioprom', 'costopromedio', 'costounitario', 'preciodecompra', 'preciocompra',
    'averagecost', 'averageprice', 'avgcost', 'avgprice', 'costpershare', 'costbasispershare', 'unitcost', 'precomedio', 'customedio',
  ],
  costTotal: ['costototal', 'montoinvertido', 'totalinvertido', 'invertido', 'costo', 'costbasis', 'totalcost', 'cost', 'valorinvestido', 'custototal', 'custo'],
  value: [
    'valorizado', 'valoractual', 'valuacion', 'valordemercado', 'montovalorizado', 'saldovalorizado', 'marketvalue', 'currentvalue',
    'valoratual', 'value', 'valor', 'total', 'importe', 'monto',
  ],
  price: [
    'ultimoprecio', 'preciodemercado', 'precioactual', 'cotizacion', 'precio', 'lastprice', 'marketprice', 'currentprice', 'price', 'last',
    'close', 'precoatual', 'cotacao', 'preco', 'ultimo',
  ],
  quantity: [
    'cantidad', 'cantidadnominal', 'nominales', 'tenencia', 'cantidaddisponible', 'disponible', 'quantity', 'qty', 'shares', 'units',
    'holdings', 'position', 'posicion', 'balance', 'saldo', 'quantidade',
  ],
  currency: ['moneda', 'divisa', 'currency', 'moeda'],
};

/** Orden de asignación: primero los más específicos ("precio promedio" antes que "precio"). */
const HOLDING_ORDER: readonly HoldingRole[] = ['symbol', 'instrument', 'currency', 'unitCost', 'costTotal', 'value', 'price', 'quantity'];

/** Encabezados que indican un archivo de movimientos (no de tenencia). */
const MOVEMENT_HEADERS = ['fecha', 'date', 'data', 'tipooperacion', 'operacion', 'tipo', 'type', 'side', 'operacao'];

export interface HoldingsMapping {
  headerRow: number;
  headers: string[];
  columns: Partial<Record<HoldingRole, number>>;
  numberFormat: NumberFormat;
}

export interface HoldingRow {
  line: number;
  symbol: string;
  name?: string;
  assetType?: AssetType;
  currency: CurrencyCode;
  quantity: number;
  /** Costo promedio por unidad, tal como figura en el archivo (sin dividir por `priceUnit`). */
  unitCost?: number;
  /** Precio actual informado por el archivo (sin dividir por `priceUnit`). */
  marketPrice?: number;
  /** Valor total informado por el archivo. */
  value?: number;
  /** Unidades a las que corresponden los precios del archivo (100 = bonos cada 100 nominales); undefined si no se puede inferir. */
  priceUnit?: number;
}

export interface HoldingsResult {
  mapping: HoldingsMapping;
  rows: HoldingRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** Filas de totales o con cantidad cero. */
  skipped: number;
}

function normalizeHeader(text: string): string {
  return normalizeText(text).replace(/[^a-z0-9]/g, '');
}

export function detectHoldingColumns(headers: readonly string[]): Partial<Record<HoldingRole, number>> {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const columns: Partial<Record<HoldingRole, number>> = {};
  for (const role of HOLDING_ORDER) {
    const synonyms = HOLDING_SYNONYMS[role];
    let best: { i: number; rank: number } | undefined;
    norm.forEach((h, i) => {
      if (used.has(i) || !h) return;
      const exact = synonyms.indexOf(h);
      const partial = synonyms.findIndex((s) => s.length >= 5 && h.includes(s));
      const rank = exact >= 0 ? exact : partial >= 0 ? 100 + partial : -1;
      if (rank >= 0 && (!best || rank < best.rank)) best = { i, rank };
    });
    if (best) {
      columns[role] = best.i;
      used.add(best.i);
    }
  }
  return columns;
}

/** Busca la fila de encabezados de una tabla de tenencia (activo + cantidad, sin fecha ni operación). */
export function detectHoldingsMapping(rows: string[][], defaultCurrency?: CurrencyCode): HoldingsMapping | null {
  const limit = Math.min(rows.length, 15);
  for (let r = 0; r < limit; r++) {
    const row = rows[r]!;
    if (isBlankRow(row)) continue;
    const columns = detectHoldingColumns(row);
    if ((columns.symbol === undefined && columns.instrument === undefined) || columns.quantity === undefined) continue;
    const norm = row.map(normalizeHeader);
    const movementCols = norm.filter((h) => MOVEMENT_HEADERS.includes(h)).length;
    if (movementCols >= 2) continue;
    const numericCols = [columns.quantity, columns.unitCost, columns.costTotal, columns.value, columns.price].filter((i): i is number => i !== undefined);
    const sample = rows.slice(r + 1, r + 200).flatMap((cells) => numericCols.map((i) => cells[i] ?? ''));
    return { headerRow: r, headers: row.map((h) => h.trim()), columns, numberFormat: holdingsNumberFormat(sample, defaultCurrency) };
  }
  return null;
}

/** Monedas cuyos países escriben los números con coma decimal (1.234,56). */
const COMMA_DECIMAL = new Set(['ARS', 'BRL', 'EUR', 'CLP', 'COP', 'UYU', 'PYG', 'BOB', 'VES', 'TRY', 'IDR', 'VND']);

/** Formato de números; si todos los valores son ambiguos ("50.000"), se decide por la moneda. */
function holdingsNumberFormat(cells: readonly string[], currency?: CurrencyCode): NumberFormat {
  let comma = 0;
  let dot = 0;
  for (const raw of cells) {
    const hint = numberHint(raw);
    if (hint === 'comma') comma++;
    else if (hint === 'dot') dot++;
  }
  if (comma === dot) return currency && COMMA_DECIMAL.has(currency) ? 'comma' : 'dot';
  return comma > dot ? 'comma' : 'dot';
}

const CASH_WORDS: Record<string, CurrencyCode> = {
  peso: 'ARS', pesos: 'ARS', pesosargentinos: 'ARS', pesoargentino: 'ARS', ars: 'ARS',
  dolar: 'USD', dolares: 'USD', dolarmep: 'USD', dolaresmep: 'USD', dolarcable: 'USD', dolarescable: 'USD', dolaresestadounidenses: 'USD',
  usd: 'USD', usdollar: 'USD', dollar: 'USD', dollars: 'USD',
  euro: 'EUR', euros: 'EUR', eur: 'EUR', real: 'BRL', reais: 'BRL', brl: 'BRL',
  pesomexicano: 'MXN', pesosmexicanos: 'MXN', mxn: 'MXN', pesochileno: 'CLP', clp: 'CLP', pesocolombiano: 'COP', cop: 'COP',
  pesouruguayo: 'UYU', uyu: 'UYU', solesperuanos: 'PEN', solperuano: 'PEN',
};
const GENERIC_CASH = ['efectivo', 'cash', 'saldodisponible', 'disponible', 'dinero', 'dinheiro', 'caja'];

/** Moneda si la fila es efectivo ("Pesos", "Dólares MEP", "Cash"); undefined si es otro activo. */
function cashCurrency(text: string, currency: CurrencyCode): CurrencyCode | undefined {
  const t = normalizeHeader(text);
  if (!t) return undefined;
  if (CASH_WORDS[t]) return CASH_WORDS[t];
  if (GENERIC_CASH.includes(t) || /^(efectivo|cash)/.test(t)) return currency;
  return undefined;
}

const PRICE_UNITS = [1, 100, 1000];

/**
 * Unidades a las que corresponde un precio (1, 100 o 1000), comparando cantidad × precio con el valor
 * informado. `tolerance` es el factor máximo de diferencia aceptado (el costo puede alejarse del valor).
 */
export function inferPriceUnit(quantity: number, price: number, value: number, tolerance: number): number | undefined {
  if (!(quantity > 0 && price > 0 && value > 0)) return undefined;
  const ratio = (quantity * price) / value;
  let best: { unit: number; err: number } | undefined;
  for (const unit of PRICE_UNITS) {
    const err = Math.abs(Math.log(ratio / unit));
    if (!best || err < best.err) best = { unit, err };
  }
  return best && best.err <= Math.log(tolerance) ? best.unit : undefined;
}

/** Interpreta una tabla de tenencia. Los activos repetidos se suman (costo promedio ponderado). */
export function parseHoldings(rows: string[][], mapping: HoldingsMapping, defaultCurrency: CurrencyCode = 'USD'): HoldingsResult {
  const col = mapping.columns;
  const cell = (cells: string[], role: HoldingRole) => (col[role] !== undefined ? (cells[col[role]!] ?? '').trim() : '');
  const num = (cells: string[], role: HoldingRole) => {
    const raw = cell(cells, role);
    const v = raw ? Math.abs(parseLocaleNumber(raw, mapping.numberFormat)) : NaN;
    return Number.isFinite(v) ? v : undefined;
  };
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const byKey = new Map<string, HoldingRow>();
  let skipped = 0;

  rows.slice(mapping.headerRow + 1).forEach((cells, idx) => {
    const line = mapping.headerRow + idx + 2;
    if (isBlankRow(cells)) return;
    const rawSymbol = cell(cells, 'symbol');
    const description = cell(cells, 'instrument');
    const label = description || rawSymbol;
    const first = normalizeText(cells.find((c) => c.trim()) ?? '');
    if (!label || /^(sub)?total(es)?\b/.test(first) || /^(sub)?total(es)?\b/.test(normalizeText(label))) {
      skipped++;
      return;
    }

    let currency = normalizeCurrency(cell(cells, 'currency'), defaultCurrency);
    let quantity = num(cells, 'quantity');
    const value = num(cells, 'value');
    let price = num(cells, 'price');
    let unitCost = num(cells, 'unitCost');
    const costTotal = num(cells, 'costTotal');

    const cash = cashCurrency(rawSymbol, currency) ?? cashCurrency(description, currency);
    let symbol: string | undefined;
    let assetType: AssetType | undefined;
    let priceUnit: number | undefined;
    if (cash) {
      currency = cash;
      symbol = cash;
      assetType = 'cash';
      if (!quantity && value) quantity = value;
      price = 1;
      unitCost = 1;
      priceUnit = 1;
    } else {
      symbol =
        extractSymbol(rawSymbol) ??
        (rawSymbol && /^[\w.\-/]{1,15}$/.test(rawSymbol) ? rawSymbol.split('/')[0]!.toUpperCase() : undefined) ??
        extractSymbol(description);
      if (!symbol) {
        errors.push({ line, message: `No se encontró el símbolo de "${label}".` });
        return;
      }
      assetType = guessAssetType(symbol, description);
      if (unitCost === undefined && costTotal !== undefined && quantity) unitCost = costTotal / quantity;
      if (quantity && value) {
        priceUnit = price !== undefined ? inferPriceUnit(quantity, price, value, 1.25) : undefined;
        priceUnit ??= unitCost !== undefined ? inferPriceUnit(quantity, unitCost, value, 3) : undefined;
      }
      if (price === undefined && value !== undefined && quantity) {
        price = value / quantity;
        priceUnit ??= 1;
      }
    }

    if (!quantity || quantity <= 0) {
      skipped++;
      return;
    }

    const key = `${symbol}|${assetType ?? ''}|${currency}`;
    const prev = byKey.get(key);
    if (prev) {
      const totalQty = prev.quantity + quantity;
      if (prev.unitCost !== undefined && unitCost !== undefined) {
        prev.unitCost = (prev.unitCost * prev.quantity + unitCost * quantity) / totalQty;
      } else {
        prev.unitCost = undefined;
      }
      prev.quantity = totalQty;
      prev.value = prev.value !== undefined && value !== undefined ? prev.value + value : undefined;
      return;
    }
    byKey.set(key, {
      line,
      symbol,
      name: assetType === 'cash' ? undefined : cleanName(description) || undefined,
      assetType,
      currency,
      quantity,
      unitCost,
      marketPrice: price,
      value,
      priceUnit,
    });
  });

  return { mapping, rows: [...byKey.values()], errors, warnings, skipped };
}

export function importHoldings(text: string, defaultCurrency?: CurrencyCode): HoldingsResult | null {
  const rows = parseCsv(text);
  const mapping = detectHoldingsMapping(rows, defaultCurrency);
  return mapping ? parseHoldings(rows, mapping, defaultCurrency) : null;
}

export type ImportedFile =
  | { kind: 'transactions'; result: ImportResult | SmartImportResult }
  | { kind: 'holdings'; result: HoldingsResult };

/**
 * Interpreta un archivo exportado: movimientos (con fecha y operación) o tenencia (cartera a una fecha).
 * Si no se reconoce ninguno, devuelve el resultado de movimientos con su error.
 */
export function importFile(text: string, options: ImportOptions = {}): ImportedFile {
  const rows = parseCsv(text);
  const tx = importCsv(text, undefined, options);
  const smartMapping = isSmartResult(tx) ? tx.mapping : tx.templateId === 'smart' ? null : undefined;
  // Plantilla conocida, o movimientos con columna de operación: es un archivo de movimientos.
  if (smartMapping === undefined || (smartMapping && smartMapping.columns.type?.length)) return { kind: 'transactions', result: tx };
  const holdingsMapping = detectHoldingsMapping(rows, options.defaultCurrency);
  if (holdingsMapping) {
    return { kind: 'holdings', result: parseHoldings(rows, holdingsMapping, options.defaultCurrency) };
  }
  return { kind: 'transactions', result: tx };
}

export type TemplateLang = 'es' | 'en' | 'pt';

/** Idioma de la planilla según el idioma de la app (es por defecto). */
export function templateLang(language: string | undefined): TemplateLang {
  const code = (language ?? '').slice(0, 2).toLowerCase();
  return code === 'en' || code === 'pt' ? code : 'es';
}

const HOLDINGS_TEMPLATE_HEADERS: Record<TemplateLang, readonly string[]> = {
  es: ['Activo', 'Nombre', 'Cantidad', 'Precio promedio', 'Moneda'],
  en: ['Symbol', 'Name', 'Quantity', 'Average cost', 'Currency'],
  pt: ['Ativo', 'Nome', 'Quantidade', 'Preço médio', 'Moeda'],
};

const HOLDINGS_TEMPLATE_ROWS: Record<TemplateLang, readonly (readonly string[])[]> = {
  es: [
    ['GGAL', 'Grupo Financiero Galicia', '100', '5000.50', 'ARS'],
    ['AAPL', 'Apple Inc.', '10', '185.20', 'USD'],
    ['BTC', 'Bitcoin', '0.05', '98000.00', 'USD'],
    ['ARS', 'Efectivo en pesos', '250000.00', '', 'ARS'],
  ],
  en: [
    ['AAPL', 'Apple Inc.', '10', '185.20', 'USD'],
    ['VOO', 'Vanguard S&P 500 ETF', '5', '480.75', 'USD'],
    ['BTC', 'Bitcoin', '0.05', '98000.00', 'USD'],
    ['USD', 'Cash', '1500.00', '', 'USD'],
  ],
  pt: [
    ['PETR4', 'Petrobras PN', '100', '30.50', 'BRL'],
    ['AAPL', 'Apple Inc.', '10', '185.20', 'USD'],
    ['BTC', 'Bitcoin', '0.05', '98000.00', 'USD'],
    ['BRL', 'Saldo em reais', '2500.00', '', 'BRL'],
  ],
};

/**
 * Planilla de tenencia de la app: una fila por activo con cantidad y, opcionalmente, precio promedio.
 * Si se deja vacío el precio promedio, se usa el precio de mercado de la fecha del saldo inicial.
 */
export function holdingsTemplate(lang: TemplateLang = 'es'): string {
  return [HOLDINGS_TEMPLATE_HEADERS[lang], ...HOLDINGS_TEMPLATE_ROWS[lang]].map((row) => row.join(',')).join('\n');
}
