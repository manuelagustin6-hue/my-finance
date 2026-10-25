import { describe, expect, it } from 'vitest';
import {
  GENERIC_TEMPLATE_EXAMPLE,
  importCsv,
  parseCsv,
  parseDate,
  parseNumber,
  splitPair,
  transactionFingerprint,
} from '../src/index.ts';

describe('parseCsv', () => {
  it('respeta comillas, comillas escapadas y saltos de línea', () => {
    const rows = parseCsv('a,b,c\n"1,5","dijo ""hola""","línea\nnueva"\r\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1,5', 'dijo "hola"', 'línea\nnueva'],
    ]);
  });

  it('detecta punto y coma como separador', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseNumber', () => {
  it.each([
    ['1,234.56', 1234.56],
    ['1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1.234.567', 1234567],
    ['$ 1.000,5', 1000.5],
    ['-0.5', -0.5],
    ['1e-8', 1e-8],
    ['', NaN],
    ['abc', NaN],
  ])('%s → %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe('parseDate', () => {
  it.each([
    ['2025-01-15', '2025-01-15'],
    ['2025-01-15 10:20:30', '2025-01-15T10:20:30Z'],
    ['2025-01-15T10:20:30Z', '2025-01-15T10:20:30Z'],
    ['15/01/2025', '2025-01-15'],
    ['20250115', '2025-01-15'],
    ['20250115;103000', '2025-01-15T10:30:00Z'],
  ])('%s → %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it('interpreta mes primero si se indica', () => {
    expect(parseDate('01/15/2025', true)).toBe('2025-01-15');
  });

  it('rechaza fechas imposibles', () => {
    expect(parseDate('2025-13-01')).toBeUndefined();
  });
});

describe('plantilla de la app', () => {
  it('interpreta el ejemplo descargable', () => {
    const result = importCsv(GENERIC_TEMPLATE_EXAMPLE);
    expect(result.templateId).toBe('generic');
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]).toMatchObject({ type: 'buy', symbol: 'AAPL', quantity: 10, price: 185.2, fee: 1 });
    expect(result.rows[2]).toMatchObject({ type: 'dividend', amount: 2.4, quantity: 0 });
  });

  it('acepta tipos en español y reporta errores por línea', () => {
    const result = importCsv('date,type,symbol,quantity,price\n15/01/2025,compra,ggal,10,6500\n2025-01-16,regalo,X,1,1');
    expect(result.rows[0]).toMatchObject({ type: 'buy', symbol: 'GGAL', date: '2025-01-15' });
    expect(result.errors).toEqual([{ line: 3, message: 'Tipo de operación desconocido: "regalo"' }]);
  });
});

describe('Binance', () => {
  it('separa pares', () => {
    expect(splitPair('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' });
    expect(splitPair('ETH/BTC')).toEqual({ base: 'ETH', quote: 'BTC' });
  });

  it('interpreta el historial y convierte comisiones cobradas en el activo', () => {
    const csv = [
      '"Date(UTC)","Pair","Side","Price","Executed","Amount","Fee"',
      '"2025-01-10 12:00:00","BTCUSDT","BUY","90000","0.01BTC","900USDT","0.00001BTC"',
      '"2025-02-10 12:00:00","BTCUSDT","SELL","100000","0.005BTC","500USDT","0.5USDT"',
      '"2025-02-11 12:00:00","ETHUSDT","BUY","3000","1ETH","3000USDT","0.003BNB"',
    ].join('\n');
    const result = importCsv(csv);
    expect(result.templateId).toBe('binance');
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ type: 'buy', symbol: 'BTC', quantity: 0.01, price: 90000, currency: 'USDT' });
    expect(result.rows[0]!.fee).toBeCloseTo(0.9);
    expect(result.rows[1]).toMatchObject({ type: 'sell', fee: 0.5 });
    expect(result.rows[2]!.fee).toBe(0);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('Coinbase', () => {
  it('saltea el preámbulo y mapea tipos', () => {
    const csv = [
      'You can use this transaction report to inform your likely tax obligations.',
      '',
      'Transactions',
      'User,me@example.com,abc',
      'ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes',
      'x1,2025-01-05 10:00:00 UTC,Buy,BTC,0.002,USD,$95000.00,$190.00,$192.99,$2.99,Bought 0.002 BTC',
      'x2,2025-01-06 10:00:00 UTC,Staking Income,ETH,0.001,USD,$3500,$3.5,$3.5,$0,',
      'x3,2025-01-07 10:00:00 UTC,Convert,ETH,0.1,USD,$3500,$350,$350,$0,Converted',
    ].join('\n');
    const result = importCsv(csv);
    expect(result.templateId).toBe('coinbase');
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ type: 'buy', symbol: 'BTC', quantity: 0.002, price: 95000, fee: 2.99, externalId: 'x1' });
    expect(result.rows[1]).toMatchObject({ type: 'deposit', symbol: 'ETH' });
    expect(result.warnings.some((w) => w.line === 8)).toBe(true);
  });
});

describe('Interactive Brokers', () => {
  it('interpreta un Flex Query de operaciones', () => {
    const csv = [
      '"Symbol","AssetClass","CurrencyPrimary","TradeDate","Quantity","TradePrice","IBCommission","Buy/Sell","TradeID"',
      '"VTI","STK","USD","20250110","5","280.5","-1","BUY","111"',
      '"VTI","STK","USD","20250210","-2","290","-1","SELL","112"',
      '"SPY  250321C00600000","OPT","USD","20250210","1","5","-0.65","BUY","113"',
    ].join('\n');
    const result = importCsv(csv);
    expect(result.templateId).toBe('ibkr');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ type: 'buy', quantity: 5, price: 280.5, fee: 1, date: '2025-01-10', externalId: '111' });
    expect(result.rows[1]).toMatchObject({ type: 'sell', quantity: 2 });
    expect(result.warnings).toHaveLength(1);
  });
});

describe('formato desconocido y duplicados', () => {
  it('informa que no reconoce el archivo', () => {
    expect(importCsv('foo,bar\n1,2').errors[0]!.message).toMatch(/No se encontraron columnas/);
  });

  it('genera la misma huella para la misma operación', () => {
    const a = transactionFingerprint({ date: '2025-01-01', type: 'buy', symbol: 'AAPL', quantity: 1, price: 100 });
    const b = transactionFingerprint({ date: '2025-01-01T00:00:00Z', type: 'buy', symbol: 'AAPL', quantity: 1.0, price: 100.0 });
    expect(a).not.toBe(b); // distinta precisión de fecha
    expect(a).toBe(transactionFingerprint({ date: '2025-01-01', type: 'buy', symbol: 'AAPL', quantity: 1, price: 100 }));
    expect(transactionFingerprint({ date: 'x', type: 'buy', quantity: 0, price: 0, externalId: '9' })).toBe('ext:9');
  });
});
