import { describe, expect, it } from 'vitest';
import {
  calculateFee,
  computePositions,
  netSellProceeds,
  summarizePortfolio,
  totalBuyCost,
  valuePosition,
  type Quote,
  type Transaction,
} from '../src/index.ts';

let seq = 0;
function tx(partial: Partial<Transaction> & Pick<Transaction, 'type' | 'date'>): Transaction {
  return {
    id: `t${++seq}`,
    walletId: 'w1',
    assetId: 'AAPL',
    quantity: 0,
    price: 0,
    fee: 0,
    currency: 'USD',
    ...partial,
  };
}

const quotes = (entries: Record<string, number>, currency = 'USD', previous?: Record<string, number>) =>
  new Map<string, Quote>(
    Object.entries(entries).map(([assetId, price]) => [
      assetId,
      { assetId, price, currency, previousClose: previous?.[assetId], asOf: '2025-06-01' },
    ]),
  );

describe('calculateFee', () => {
  const schedule = { percent: 0.5, fixed: 1, minimum: 5 };

  it('aplica el mínimo cuando el variable es menor', () => {
    expect(calculateFee(schedule, 100)).toBe(5);
  });

  it('suma porcentaje y fijo', () => {
    expect(calculateFee(schedule, 2000)).toBe(11);
  });

  it('no cobra si el monto es cero', () => {
    expect(calculateFee(schedule, 0)).toBe(0);
  });

  it('calcula costo total de compra e ingreso neto de venta', () => {
    expect(totalBuyCost(schedule, 10, 200)).toBe(2011);
    expect(netSellProceeds(schedule, 10, 200)).toBe(1989);
  });
});

describe('computePositions', () => {
  it('usa costo promedio con comisiones y calcula P&L realizado y no realizado', () => {
    const { consolidated, warnings } = computePositions(
      [
        tx({ type: 'buy', date: '2025-01-01', quantity: 10, price: 100, fee: 10 }),
        tx({ type: 'buy', date: '2025-02-01', quantity: 10, price: 120, fee: 10 }),
        tx({ type: 'sell', date: '2025-03-01', quantity: 5, price: 130, fee: 5 }),
      ],
      { baseCurrency: 'USD' },
    );
    expect(warnings).toEqual([]);
    const p = consolidated[0]!;
    expect(p.quantity).toBe(15);
    expect(p.costBasis).toBeCloseTo(1665);
    expect(p.realizedPnl).toBeCloseTo(90); // 645 − 5 × 111
    expect(p.feesPaid).toBe(25);
    expect(p.totalInvested).toBe(2220);

    const v = valuePosition(p, { baseCurrency: 'USD', quotes: quotes({ AAPL: 140 }), fx: () => 1 });
    expect(v.avgCost).toBeCloseTo(111);
    expect(v.marketValue).toBe(2100);
    expect(v.unrealizedPnl).toBeCloseTo(435);
    expect(v.unrealizedPnlPct).toBeCloseTo(435 / 1665);
    expect(v.totalPnlBase).toBeCloseTo(525);
  });

  it('ordena por fecha aunque las operaciones lleguen desordenadas', () => {
    const { consolidated, warnings } = computePositions(
      [
        tx({ type: 'sell', date: '2025-03-01', quantity: 5, price: 130 }),
        tx({ type: 'buy', date: '2025-01-01', quantity: 10, price: 100 }),
      ],
      { baseCurrency: 'USD' },
    );
    expect(warnings).toEqual([]);
    expect(consolidated[0]!.quantity).toBe(5);
    expect(consolidated[0]!.realizedPnl).toBeCloseTo(150);
  });

  it('separa el efecto del tipo de cambio en moneda base', () => {
    const { consolidated } = computePositions(
      [tx({ type: 'buy', date: '2025-01-01', quantity: 1, price: 100, fxRate: 1000 })],
      { baseCurrency: 'ARS' },
    );
    const v = valuePosition(consolidated[0]!, {
      baseCurrency: 'ARS',
      quotes: quotes({ AAPL: 110 }),
      fx: (from, to) => (from === 'USD' && to === 'ARS' ? 1200 : undefined),
    });
    expect(v.costBasisBase).toBe(100_000);
    expect(v.marketValueBase).toBe(132_000);
    expect(v.unrealizedPnlBase).toBe(32_000);
    expect(v.unrealizedPnl).toBe(10);
  });

  it('ignora el tipo de cambio guardado si se registró contra otra moneda base', () => {
    const { consolidated } = computePositions(
      [tx({ type: 'buy', date: '2025-01-01', quantity: 1, price: 100, fxRate: 1000, fxBase: 'ARS' })],
      { baseCurrency: 'EUR', fx: () => 0.9 },
    );
    expect(consolidated[0]!.costBasisBase).toBeCloseTo(90);
  });

  it('usa el tipo de cambio histórico cuando la operación no lo trae', () => {
    const { consolidated, warnings } = computePositions(
      [tx({ type: 'buy', date: '2025-01-01', quantity: 2, price: 50 })],
      { baseCurrency: 'EUR', fx: (_f, _t, date) => (date === '2025-01-01' ? 0.9 : undefined) },
    );
    expect(warnings).toEqual([]);
    expect(consolidated[0]!.costBasisBase).toBeCloseTo(90);
  });

  it('advierte si falta el tipo de cambio', () => {
    const { warnings } = computePositions(
      [tx({ type: 'buy', date: '2025-01-01', quantity: 1, price: 100 })],
      { baseCurrency: 'ARS' },
    );
    expect(warnings[0]?.code).toBe('missing_fx');
  });

  it('convierte a la moneda del activo las operaciones en otra moneda (operatoria MEP)', () => {
    // AL30 cotiza en USD: se compra en pesos y se vende en dólares.
    const rates: Record<string, number> = { '2025-01-10': 1000, '2025-02-10': 1100 };
    const fx = (from: string, to: string, date?: string) => {
      const ars = rates[date?.slice(0, 10) ?? ''] ?? 1200;
      if (from === 'ARS' && to === 'USD') return 1 / ars;
      if (from === 'USD' && to === 'ARS') return ars;
      return from === to ? 1 : undefined;
    };
    const { consolidated, warnings } = computePositions(
      [
        tx({ type: 'buy', assetId: 'AL30', date: '2025-01-10', quantity: 100, price: 650, fee: 0, currency: 'ARS' }),
        tx({ type: 'sell', assetId: 'AL30', date: '2025-02-10', quantity: 50, price: 0.7, fee: 0, currency: 'USD' }),
      ],
      { baseCurrency: 'USD', fx, assetCurrency: () => 'USD' },
    );
    expect(warnings).toEqual([]);
    const p = consolidated[0]!;
    expect(p.currency).toBe('USD');
    expect(p.costBasis).toBeCloseTo(32.5); // 65.000 ARS / 1.000 = 65 USD, quedan la mitad
    expect(p.realizedPnl).toBeCloseTo(2.5); // 35 USD − 32,5 USD
  });

  it('advierte si no puede convertir entre monedas', () => {
    const { warnings } = computePositions(
      [
        tx({ type: 'buy', assetId: 'X', date: '2025-01-10', quantity: 1, price: 10, currency: 'ARS' }),
      ],
      { baseCurrency: 'ARS', assetCurrency: () => 'USD' },
    );
    expect(warnings.map((w) => w.code)).toContain('currency_mismatch');
  });

  it('aplica splits sin cambiar el costo total', () => {
    const { consolidated } = computePositions(
      [
        tx({ type: 'buy', date: '2025-01-01', quantity: 10, price: 100 }),
        tx({ type: 'split', date: '2025-02-01', quantity: 2 }),
      ],
      { baseCurrency: 'USD' },
    );
    expect(consolidated[0]!.quantity).toBe(20);
    expect(consolidated[0]!.costBasis).toBe(1000);
  });

  it('registra dividendos netos de comisión como ingreso', () => {
    const { consolidated } = computePositions(
      [
        tx({ type: 'buy', date: '2025-01-01', quantity: 10, price: 100 }),
        tx({ type: 'dividend', date: '2025-02-01', amount: 20, fee: 2 }),
      ],
      { baseCurrency: 'USD' },
    );
    expect(consolidated[0]!.income).toBe(18);
    expect(consolidated[0]!.costBasis).toBe(1000);
  });

  it('descuenta comisiones sueltas (custodia) del resultado', () => {
    const { consolidated } = computePositions(
      [
        tx({ type: 'buy', date: '2025-01-01', quantity: 1, price: 100 }),
        tx({ type: 'fee', date: '2025-02-01', amount: 3 }),
      ],
      { baseCurrency: 'USD' },
    );
    expect(consolidated[0]!.realizedPnl).toBe(-3);
    expect(consolidated[0]!.feesPaid).toBe(3);
  });

  it('ajusta y advierte si se vende más de lo que se tiene', () => {
    const { consolidated, warnings } = computePositions(
      [
        tx({ type: 'buy', date: '2025-01-01', quantity: 1, price: 100 }),
        tx({ type: 'sell', date: '2025-02-01', quantity: 2, price: 150 }),
      ],
      { baseCurrency: 'USD' },
    );
    expect(warnings.map((w) => w.code)).toEqual(['oversell']);
    expect(consolidated[0]!.quantity).toBe(0);
    expect(consolidated[0]!.realizedPnl).toBe(50);
  });

  it('las transferencias entre billeteras mueven el costo y solo la comisión es pérdida', () => {
    const { byWallet, consolidated } = computePositions(
      [
        tx({ type: 'buy', walletId: 'w1', assetId: 'BTC', date: '2025-01-01', quantity: 1, price: 50_000, fee: 50 }),
        tx({ type: 'transfer_out', walletId: 'w1', assetId: 'BTC', date: '2025-01-02', quantity: 1, price: 0, fee: 10 }),
        tx({ type: 'transfer_in', walletId: 'w2', assetId: 'BTC', date: '2025-01-02', quantity: 1, price: 50_050 }),
      ],
      { baseCurrency: 'USD' },
    );
    const w1 = byWallet.find((p) => p.walletId === 'w1')!;
    const w2 = byWallet.find((p) => p.walletId === 'w2')!;
    expect(w1.quantity).toBe(0);
    expect(w1.realizedPnl).toBe(-10);
    expect(w2.costBasis).toBe(50_050);
    expect(consolidated[0]!.quantity).toBe(1);
    expect(consolidated[0]!.costBasis).toBe(50_050);
    expect(consolidated[0]!.realizedPnl).toBe(-10);
  });

  it('consolida el mismo activo en varias billeteras', () => {
    const { byWallet, consolidated } = computePositions(
      [
        tx({ type: 'buy', walletId: 'w1', date: '2025-01-01', quantity: 5, price: 100, fee: 5 }),
        tx({ type: 'buy', walletId: 'w2', date: '2025-01-02', quantity: 5, price: 110, fee: 1 }),
      ],
      { baseCurrency: 'USD' },
    );
    expect(byWallet).toHaveLength(2);
    expect(consolidated).toHaveLength(1);
    expect(consolidated[0]!.quantity).toBe(10);
    expect(consolidated[0]!.costBasis).toBe(1056);
    expect(consolidated[0]!.walletId).toBeNull();
  });
});

describe('summarizePortfolio', () => {
  it('totaliza valor, pesos, variación diaria y distribución', () => {
    const { consolidated } = computePositions(
      [
        tx({ type: 'buy', assetId: 'AAPL', date: '2025-01-01', quantity: 10, price: 100 }),
        tx({ type: 'buy', assetId: 'BTC', date: '2025-01-01', quantity: 0.1, price: 50_000 }),
        tx({ type: 'buy', assetId: 'KO', date: '2025-01-01', quantity: 1, price: 50 }),
        tx({ type: 'sell', assetId: 'KO', date: '2025-02-01', quantity: 1, price: 60 }),
      ],
      { baseCurrency: 'USD' },
    );
    const summary = summarizePortfolio(consolidated, {
      baseCurrency: 'USD',
      quotes: quotes({ AAPL: 150, BTC: 60_000 }, 'USD', { AAPL: 140, BTC: 60_000 }),
      fx: () => 1,
      assets: new Map([
        ['AAPL', { id: 'AAPL', symbol: 'AAPL', name: 'Apple', type: 'stock', currency: 'USD', country: 'US' }],
        ['BTC', { id: 'BTC', symbol: 'BTC', name: 'Bitcoin', type: 'crypto', currency: 'USD' }],
      ]),
    });
    expect(summary.totalValue).toBe(7500);
    expect(summary.totalCost).toBe(6000);
    expect(summary.unrealizedPnl).toBe(1500);
    expect(summary.realizedPnl).toBe(10);
    expect(summary.totalPnl).toBe(1510);
    expect(summary.dayChange).toBe(100);
    expect(summary.dayChangePct).toBeCloseTo(100 / 7400);
    expect(summary.positions.map((p) => p.assetId)).toEqual(['BTC', 'AAPL']);
    expect(summary.positions[0]!.weight).toBeCloseTo(0.8);
    expect(summary.closedPositions.map((p) => p.assetId)).toEqual(['KO']);
    expect(summary.byAssetType).toEqual([
      { key: 'crypto', value: 6000, weight: 0.8 },
      { key: 'stock', value: 1500, weight: 0.2 },
    ]);
  });

  it('valúa bonos que cotizan cada 100 nominales', () => {
    const { consolidated } = computePositions(
      [tx({ type: 'buy', assetId: 'AL30', date: '2025-01-01', quantity: 1000, price: 0.6, fee: 0 })],
      { baseCurrency: 'USD' },
    );
    const quotes = new Map([
      ['AL30', { assetId: 'AL30', price: 65, previousClose: 64, unit: 100, currency: 'USD', asOf: '2025-06-01' }],
    ]);
    const v = valuePosition(consolidated[0]!, { baseCurrency: 'USD', quotes, fx: () => 1 });
    expect(v.price).toBeCloseTo(0.65);
    expect(v.quotePrice).toBe(65);
    expect(v.marketValue).toBeCloseTo(650);
    expect(v.unrealizedPnl).toBeCloseTo(50);
    expect(v.dayChangeBase).toBeCloseTo(10);
  });

  it('usa el precio manual y, si no hay, valoriza al costo', () => {
    const { consolidated } = computePositions(
      [
        tx({ type: 'buy', assetId: 'AL30', date: '2025-01-01', quantity: 100, price: 0.6 }),
        tx({ type: 'buy', assetId: 'XYZ', date: '2025-01-01', quantity: 1, price: 10 }),
      ],
      { baseCurrency: 'USD' },
    );
    const summary = summarizePortfolio(consolidated, {
      baseCurrency: 'USD',
      quotes: new Map(),
      fx: () => 1,
      assets: new Map([
        ['AL30', { id: 'AL30', symbol: 'AL30', name: 'AL30', type: 'bond', currency: 'USD', manualPrice: 0.7 }],
      ]),
    });
    const al30 = summary.positions.find((p) => p.assetId === 'AL30')!;
    const xyz = summary.positions.find((p) => p.assetId === 'XYZ')!;
    expect(al30.marketValue).toBeCloseTo(70);
    expect(xyz.hasQuote).toBe(false);
    expect(xyz.marketValue).toBe(10);
    expect(xyz.unrealizedPnl).toBe(0);
  });
});
