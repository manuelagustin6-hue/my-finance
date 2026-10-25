import { describe, expect, it } from 'vitest';
import {
  annualizedVolatility,
  assetStats,
  dailyDates,
  maxDrawdown,
  periodReturn,
  periodStart,
  portfolioRisk,
  portfolioSeries,
  simpleReturns,
  standardDeviation,
  type Transaction,
} from '../src/index.ts';

describe('estadística básica', () => {
  it('desvío estándar muestral', () => {
    expect(standardDeviation([1, 2, 3, 4])).toBeCloseTo(1.290994, 6);
    expect(standardDeviation([5])).toBe(0);
  });

  it('retornos simples', () => {
    const r = simpleReturns([100, 110, 99]);
    expect(r[0]).toBeCloseTo(0.1);
    expect(r[1]).toBeCloseTo(-0.1);
  });

  it('volatilidad anualizada', () => {
    const daily = [0.01, -0.01, 0.01, -0.01];
    expect(annualizedVolatility(daily, 252)).toBeCloseTo(standardDeviation(daily) * Math.sqrt(252));
  });

  it('máxima caída', () => {
    expect(maxDrawdown([100, 120, 90, 130])).toBeCloseTo(-0.25);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
  });
});

describe('períodos', () => {
  const end = new Date('2025-06-15T12:00:00Z');

  it('calcula el inicio de cada período', () => {
    expect(periodStart('1W', end)).toBe('2025-06-08');
    expect(periodStart('1M', end)).toBe('2025-05-15');
    expect(periodStart('YTD', end)).toBe('2024-12-31');
    expect(periodStart('1Y', end)).toBe('2024-06-15');
    expect(periodStart('ALL', end)).toBeUndefined();
  });

  it('rendimiento del período usa el último cierre disponible antes del inicio', () => {
    const history = [
      { date: '2024-12-30', close: 100 },
      { date: '2025-01-02', close: 105 },
      { date: '2025-06-13', close: 120 },
    ];
    expect(periodReturn(history, 'YTD', end)).toBeCloseTo(0.2);
    expect(periodReturn(history, 'ALL', end)).toBeCloseTo(0.2);
    expect(periodReturn(history, '1W', end)).toBeUndefined();
  });

  it('estadísticas del activo', () => {
    const history = dailyDates('2024-06-01', '2025-06-15').map((date, i) => ({ date, close: 100 + i }));
    const stats = assetStats(history, 'crypto', end);
    expect(stats.lastPrice).toBe(history[history.length - 1]!.close);
    expect(stats.high52w).toBe(stats.lastPrice);
    expect(stats.maxDrawdown1Y).toBe(0);
    expect(stats.volatility1Y).toBeGreaterThan(0);
  });
});

describe('serie y riesgo del portafolio', () => {
  const base: Omit<Transaction, 'id' | 'type' | 'date' | 'quantity' | 'price'> = {
    walletId: 'w1',
    assetId: 'A',
    fee: 0,
    currency: 'USD',
  };

  it('el índice ponderado por tiempo neutraliza los aportes', () => {
    const points = portfolioSeries({
      transactions: [
        { ...base, id: '1', type: 'buy', date: '2025-01-01', quantity: 10, price: 100 },
        { ...base, id: '2', type: 'buy', date: '2025-01-03', quantity: 10, price: 110 },
      ],
      histories: new Map([
        [
          'A',
          [
            { date: '2025-01-01', close: 100 },
            { date: '2025-01-02', close: 110 },
            { date: '2025-01-03', close: 121 },
          ],
        ],
      ]),
      currencies: new Map([['A', 'USD']]),
      baseCurrency: 'USD',
      fx: () => 1,
      dates: dailyDates('2025-01-01', '2025-01-03'),
    });
    expect(points.map((p) => p.value)).toEqual([1000, 1100, 2420]);
    expect(points.map((p) => p.netInvested)).toEqual([1000, 1000, 2100]);
    expect(points[1]!.index).toBeCloseTo(1.1);
    expect(points[2]!.index).toBeCloseTo(1.32);

    const risk = portfolioRisk(points);
    expect(risk.twr).toBeCloseTo(0.32);
    expect(risk.maxDrawdown).toBe(0);
    expect(risk.volatility).toBeCloseTo(standardDeviation([0.1, 0.2]) * Math.sqrt(365));
  });

  it('usa la unidad de cotización de la historia (bonos cada 100 nominales)', () => {
    const points = portfolioSeries({
      transactions: [{ ...base, id: '1', type: 'buy', date: '2025-01-01', quantity: 1000, price: 0.6 }],
      histories: new Map([['A', [{ date: '2025-01-01', close: 60, unit: 100 }]]]),
      currencies: new Map([['A', 'USD']]),
      baseCurrency: 'USD',
      fx: () => 1,
      dates: ['2025-01-01'],
    });
    expect(points[0]!.value).toBeCloseTo(600);
  });

  it('convierte a moneda base', () => {
    const points = portfolioSeries({
      transactions: [{ ...base, id: '1', type: 'buy', date: '2025-01-01', quantity: 1, price: 100 }],
      histories: new Map([['A', [{ date: '2025-01-01', close: 100 }]]]),
      currencies: new Map([['A', 'USD']]),
      baseCurrency: 'ARS',
      fx: () => 1000,
      dates: ['2025-01-01'],
    });
    expect(points[0]!.value).toBe(100_000);
  });
});
