import { describe, expect, it } from 'vitest';
import {
  classifyOperation,
  detectNumberFormat,
  extractSymbol,
  importCsv,
  isSmartResult,
  missingHoldings,
  normalizeCurrency,
  parseLocaleNumber,
} from '../src/index.ts';

/** Mismo formato que el exporte de movimientos de un broker argentino (datos inventados). */
const AR_BROKER = [
  'nroTicket;nroComprobante;fechaEjecucion;fechaLiquidacion;tipoOperacion;instrumento;moneda;mercado;cantidad;precio;montoBruto;comision;ddmm;iva;otros;total',
  '1001;1;10-03-2025;10-03-2025;Recibo De Cobro;;ARS;;;;280.000;0;0;0;0;280.000',
  '1002;2;10-03-2025;10-03-2025;Compra;BANCO EJEMPLO ESC S 1 V. (BEJ);ARS;BYMA;40;6.970;-278.800;0;-223,04;-46,8384;0;-279.069,88',
  '1003;3;13-03-2025;13-03-2025;Compra Dolar Mep;BONO REP. ARGENTINA USD STEP UP 2030 (AL30);USD;BYMA;1.000;66,0202;-660,20;-1,65;-0,066;0;0;-661,92',
  '1004;4;13-03-2025;13-03-2025;Venta;BONO REP. ARGENTINA USD STEP UP 2030 (AL30);ARS;BYMA;-400;83.980;335.920;0;-33,59;0;0;335.886,41',
  '1005;5;05-05-2025;05-05-2025;Liquidacion Suscripcion Fci;FCI EJEMPLO RENDIMIENTO (FEJR);ARS;;212.075,1679;8.027,847;-1.702.507;0;0;0;0;-1.702.507',
  '1006;6;30-06-2025;30-06-2025;Dividendos;Peso argentino;ARS;;;;1.594,22;0;-1,5942;-0,3348;0;1.480,7',
  '1007;7;19-09-2025;19-09-2025;Debito Arancel Gravado;;ARS;;;;-10.000;-10.000;0;-2.100;0;-12.100',
  '1008;8;20-09-2025;20-09-2025;Operacion Rara;;ARS;;;;1;0;0;0;0;1',
  '1009;9;21-09-2025;21-09-2025;Venta;OTRO BONO (XB1);ARS;BYMA;-10;100;1.000;0;0;0;0;1.000',
].join('\n');

describe('importador inteligente', () => {
  it('reconoce columnas, formato de números y tipos sin plantilla', () => {
    const r = importCsv(AR_BROKER, undefined, { defaultCurrency: 'ARS' });
    expect(isSmartResult(r)).toBe(true);
    if (!isSmartResult(r)) return;
    expect(r.mapping.numberFormat).toBe('comma');
    const header = (i: number) => r.mapping.headers[i];
    expect(header(r.mapping.columns.date![0]!)).toBe('fechaEjecucion');
    expect(r.mapping.columns.fee!.map(header)).toEqual(['comision', 'ddmm', 'iva', 'otros']);
    expect(r.errors).toEqual([]);

    const byLine = new Map(r.rows.map((row) => [row.line, row]));
    expect(byLine.has(2)).toBe(false); // movimiento de dinero ignorado
    expect(byLine.get(3)).toMatchObject({ type: 'buy', symbol: 'BEJ', quantity: 40, price: 6970, currency: 'ARS', externalId: '1002' });
    expect(byLine.get(3)!.fee).toBeCloseTo(269.8784);
    // Bonos cotizan cada 100 nominales: el precio efectivo sale del monto bruto.
    expect(byLine.get(4)).toMatchObject({ type: 'buy', symbol: 'AL30', assetType: 'bond', quantity: 1000, currency: 'USD' });
    expect(byLine.get(4)!.price).toBeCloseTo(0.6602);
    expect(byLine.get(5)).toMatchObject({ type: 'sell', quantity: 400, price: 839.8 });
    expect(byLine.get(6)).toMatchObject({ type: 'buy', symbol: 'FEJR', assetType: 'fund' });
    expect(byLine.get(7)).toMatchObject({ type: 'dividend', symbol: 'ARS', assetType: 'cash', amount: 1594.22 });
    expect(byLine.get(8)).toMatchObject({ type: 'fee', amount: 12100, fee: 0 });
    expect(byLine.has(9)).toBe(false); // tipo desconocido: se ignora hasta que el usuario decida

    const unknown = r.types.find((t) => t.label === 'Operacion Rara');
    expect(unknown).toMatchObject({ action: 'ignore', unknown: true, count: 1 });
    expect(r.ignored).toBe(2);
  });

  it('permite cambiar la acción de un tipo de operación', () => {
    const r = importCsv(AR_BROKER, undefined, { actions: { 'operacion rara': 'interest', 'recibo de cobro': 'deposit' } });
    if (!isSmartResult(r)) throw new Error('esperaba importador inteligente');
    const lines = new Map(r.rows.map((row) => [row.line, row]));
    expect(lines.get(9)).toMatchObject({ type: 'interest', amount: 1 });
    expect(lines.get(2)).toMatchObject({ type: 'deposit', symbol: 'ARS', assetType: 'cash', quantity: 280000, price: 1 });
  });

  it('avisa ventas de activos sin compras previas en el archivo', () => {
    const r = importCsv(AR_BROKER, undefined, { defaultCurrency: 'ARS' });
    const missing = missingHoldings(r.rows.map((row) => ({ ...row, key: row.symbol })));
    expect([...missing.keys()]).toEqual(['XB1']);
    expect(missing.get('XB1')).toBe(10);
  });

  it('funciona con exportes en inglés y punto decimal', () => {
    const csv = [
      'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount',
      '01/15/2025,Buy,VOO,VANGUARD S&P 500 ETF,10,"$480.50",$1.00,"-$4,806.00"',
      '02/03/2025,Qualified Dividend,VOO,VANGUARD S&P 500 ETF,,,,"$15.20"',
      '03/10/2025,Sell,VOO,VANGUARD S&P 500 ETF,4,"$500.00",$1.00,"$1,999.00"',
      '03/11/2025,Wire Funds,,WIRE OUT,,,,"-$1,000.00"',
    ].join('\n');
    const r = importCsv(csv);
    if (!isSmartResult(r)) throw new Error('esperaba importador inteligente');
    expect(r.mapping.numberFormat).toBe('dot');
    expect(r.rows.map((x) => x.type)).toEqual(['buy', 'dividend', 'sell']);
    expect(r.rows[0]).toMatchObject({ symbol: 'VOO', quantity: 10, fee: 1 });
    expect(r.rows[0]!.price).toBe(480.5); // el precio unitario coincide con el monto: se usa tal cual
    expect(r.mapping.monthFirst).toBe(true);
    expect(r.rows[0]!.date).toBe('2025-01-15');
    expect(r.rows[1]).toMatchObject({ amount: 15.2 });
  });
});

describe('utilidades del importador inteligente', () => {
  it('formato de números', () => {
    expect(detectNumberFormat(['1.428', '65,8298', '-278.800', '6.970'])).toBe('comma');
    expect(detectNumberFormat(['1,234.56', '0.5', '10'])).toBe('dot');
    expect(detectNumberFormat(['1.428', '278.800'])).toBe('dot'); // ambiguo: punto por defecto
    expect(parseLocaleNumber('-1.702.507', 'comma')).toBe(-1702507);
    expect(parseLocaleNumber('8.027,847', 'comma')).toBe(8027.847);
    expect(parseLocaleNumber('$1,999.00', 'dot')).toBe(1999);
  });

  it('clasifica operaciones', () => {
    expect(classifyOperation('Compra Dolar Mep').action).toBe('buy');
    expect(classifyOperation('Liquidacion Rescate Fci').action).toBe('sell');
    expect(classifyOperation('DIVIDENDOS EN ESPECIE').action).toBe('transfer_in');
    expect(classifyOperation('Renta y Amortizacion USD').action).toBe('interest');
    expect(classifyOperation('Nota Debito Bp Gcias').action).toBe('fee');
    expect(classifyOperation('Orden De Pago Usd').action).toBe('ignore');
    expect(classifyOperation('Nota Credito Dividendos ARS').action).toBe('dividend');
    expect(classifyOperation('Algo raro')).toEqual({ action: 'ignore', unknown: true });
  });

  it('extrae el ticker y normaliza monedas', () => {
    expect(extractSymbol('GRUPO FINANCIERO GALICIA S.A ESCRIT.  B  1 V (GGAL)')).toBe('GGAL');
    expect(extractSymbol('AAPL')).toBe('AAPL');
    expect(extractSymbol('Peso argentino')).toBeUndefined();
    expect(normalizeCurrency('EXT', 'ARS')).toBe('USD');
    expect(normalizeCurrency('U$S', 'ARS')).toBe('USD');
    expect(normalizeCurrency('$', 'USD')).toBe('ARS');
    expect(normalizeCurrency('', 'EUR')).toBe('EUR');
  });
});
