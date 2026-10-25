import { describe, expect, it } from 'vitest';
import { computePositions, effectiveTransactions, isBeforeOpening, type Transaction } from '../src/index.ts';

const base = { walletId: 'w1', assetId: 'AL30', fee: 0, currency: 'USD' } as const;

describe('saldo inicial', () => {
  const txs: Transaction[] = [
    { ...base, id: 'old', type: 'buy', date: '2024-06-01', quantity: 100, price: 50 },
    { ...base, id: 'same-day', type: 'sell', date: '2024-12-31', quantity: 10, price: 60 },
    { ...base, id: 'open', type: 'deposit', date: '2024-12-31', quantity: 1000, price: 60, source: 'opening' },
    { ...base, id: 'sell', type: 'sell', date: '2025-02-04', quantity: 400, price: 65 },
    { ...base, id: 'other', walletId: 'w2', type: 'buy', date: '2024-01-01', quantity: 1, price: 1 },
  ];

  it('ignora la actividad hasta la fecha del saldo inicial, salvo el saldo', () => {
    const wallets = [{ id: 'w1', openingDate: '2024-12-31' }, { id: 'w2' }];
    expect(effectiveTransactions(txs, wallets).map((t) => t.id)).toEqual(['open', 'sell', 'other']);
  });

  it('el saldo inicial es el punto de comparación del resultado', () => {
    const wallets = [{ id: 'w1', openingDate: '2024-12-31' }];
    const { consolidated, warnings } = computePositions(
      effectiveTransactions(txs.filter((t) => t.walletId === 'w1'), wallets),
      { baseCurrency: 'USD' },
    );
    expect(warnings).toEqual([]);
    expect(consolidated[0]!.quantity).toBe(600);
    expect(consolidated[0]!.realizedPnl).toBeCloseTo(400 * (65 - 60));
    expect(consolidated[0]!.costBasis).toBeCloseTo(600 * 60);
  });

  it('sin saldo inicial no filtra nada', () => {
    expect(effectiveTransactions(txs, [{ id: 'w1' }])).toHaveLength(txs.length);
  });

  it('detecta filas anteriores al saldo inicial', () => {
    expect(isBeforeOpening('2024-12-31T10:00:00Z', '2024-12-31')).toBe(true);
    expect(isBeforeOpening('2025-01-01', '2024-12-31')).toBe(false);
    expect(isBeforeOpening('2020-01-01', undefined)).toBe(false);
  });
});
