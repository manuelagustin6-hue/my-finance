import { describe, expect, it } from 'vitest';
import {
  canAddAsset,
  canAddWallet,
  canImport,
  hasFeature,
  MockMarketDataProvider,
  formatPercent,
} from '../src/index.ts';

describe('planes', () => {
  it('limita billeteras, activos e importaciones en el plan Gratis', () => {
    expect(canAddWallet('free', 1).allowed).toBe(true);
    expect(canAddWallet('free', 2)).toEqual({ allowed: false, limit: 2, reason: 'wallets' });
    expect(canAddWallet('pro', 500).allowed).toBe(true);

    const fifteen = new Set(Array.from({ length: 15 }, (_, i) => `a${i}`));
    expect(canAddAsset('free', fifteen, 'a3').allowed).toBe(true);
    expect(canAddAsset('free', fifteen, 'nuevo').allowed).toBe(false);
    expect(canAddAsset('pro', fifteen, 'nuevo').allowed).toBe(true);

    expect(canImport('free', 0).allowed).toBe(true);
    expect(canImport('free', 1).allowed).toBe(false);
  });

  it('habilita funciones de análisis solo en Pro', () => {
    expect(hasFeature('free', 'portfolio_analytics')).toBe(false);
    expect(hasFeature('pro', 'portfolio_analytics')).toBe(true);
  });
});

describe('MockMarketDataProvider', () => {
  const today = () => new Date('2026-03-04T15:00:00Z'); // miércoles
  const provider = new MockMarketDataProvider(today);

  it('busca por símbolo y nombre', async () => {
    expect((await provider.search('apple'))[0]?.symbol).toBe('AAPL');
    expect((await provider.search('BTC'))[0]?.symbol).toBe('BTC');
    expect(await provider.search('')).toEqual([]);
  });

  it('las cotizaciones son determinísticas y coinciden con la historia', async () => {
    const [q1] = await provider.getQuotes([{ providerId: 'AAPL', type: 'stock' }]);
    const [q2] = await new MockMarketDataProvider(today).getQuotes([{ providerId: 'AAPL', type: 'stock' }]);
    expect(q1!.price).toBe(q2!.price);
    expect(q1!.price).toBeGreaterThan(0);
    const history = await provider.getHistory({ providerId: 'AAPL', type: 'stock' }, '1M');
    expect(history[history.length - 1]!.close).toBe(q1!.price);
    expect(history.every((p) => ![0, 6].includes(new Date(`${p.date}T00:00:00Z`).getUTCDay()))).toBe(true);
  });

  it('las cripto cotizan todos los días', async () => {
    const history = await provider.getHistory({ providerId: 'BTC', type: 'crypto' }, '1M');
    expect(history).toHaveLength(32);
  });

  it('historia larga se calcula rápido', async () => {
    const start = Date.now();
    const history = await provider.getHistory({ providerId: 'ETH', type: 'crypto' }, 'MAX');
    expect(history.length).toBeGreaterThan(3600);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('convierte monedas', async () => {
    const rates = await provider.getFxRates('ARS', ['USD', 'EUR', 'ARS']);
    expect(rates.USD).toBe(1150);
    expect(rates.ARS).toBe(1);
    expect(rates.EUR).toBeCloseTo(1150 / 0.92);
  });

  it('genera fundamentales solo para acciones', async () => {
    const f = await provider.getFundamentals({ providerId: 'MSFT', type: 'stock' });
    expect(f?.statements).toHaveLength(8);
    expect(f?.simulated).toBe(true);
    expect(f!.statements[0]!.period < today().toISOString()).toBe(true);
    expect(await provider.getFundamentals({ providerId: 'BTC', type: 'crypto' })).toBeNull();
  });
});

describe('formato', () => {
  it('porcentajes con signo', () => {
    expect(formatPercent(0.1234, 'en-US')).toBe('+12.34%');
    expect(formatPercent(-0.05, 'en-US')).toBe('-5.00%');
  });
});
