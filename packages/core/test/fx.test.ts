import { describe, expect, it } from 'vitest';
import { computePositions, crossRate, FxTable, PublicFxProvider, weeklyDates, type FxCache } from '../src/index.ts';

/** Respuestas con el mismo formato que las APIs públicas. */
function fakeFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    const body = routes[url];
    return { ok: body !== undefined, status: body !== undefined ? 200 : 404, json: async () => body };
  };
}

const CDN = (d: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${d}/v1/currencies/usd.min.json`;

function memoryCache(): FxCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return { store, get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) };
}

describe('conversión con el dólar como puente', () => {
  it('cruza dos monedas no dólar', () => {
    const rates = { ARS: 1200, MXN: 20, EUR: 0.9 };
    expect(crossRate(rates, 'MXN', 'ARS')).toBeCloseTo(60);
    expect(crossRate(rates, 'ARS', 'USD')).toBeCloseTo(1 / 1200);
    expect(crossRate(rates, 'USDT', 'ARS')).toBe(1200);
    expect(crossRate(rates, 'XYZ', 'ARS')).toBeUndefined();
  });

  it('FxTable usa la última cotización anterior a la fecha', () => {
    const table = new FxTable({ ARS: 1500 }, { '2025-01-10': { ARS: 1000 }, '2025-02-10': { ARS: 1100 } });
    expect(table.perUsd('ARS', '2025-01-15')).toBe(1000);
    expect(table.perUsd('ARS', '2025-02-10')).toBe(1100);
    expect(table.perUsd('ARS', '2024-12-01')).toBe(1000); // antes de la historia: primer dato
    expect(table.perUsd('ARS')).toBe(1500);
    expect(table.rate('ARS', 'USD', '2025-01-15')).toBeCloseTo(0.001);
  });

  it('el costo en dólares de una compra en pesos usa el tipo de cambio de ese día', () => {
    const table = new FxTable({ ARS: 1500 }, { '2025-01-10': { ARS: 1000 } });
    const { consolidated } = computePositions(
      [{ id: '1', walletId: 'w', assetId: 'GGAL', type: 'buy', quantity: 10, price: 5000, fee: 0, currency: 'ARS', date: '2025-01-10' }],
      { baseCurrency: 'USD', fx: table.lookup() },
    );
    expect(consolidated[0]!.costBasisBase).toBeCloseTo(50); // 50.000 ARS / 1.000
  });
});

describe('PublicFxProvider', () => {
  const today = () => new Date('2025-06-20T15:00:00Z');
  const routes: Record<string, unknown> = {
    [CDN('latest')]: { date: '2025-06-20', usd: { ars: 1180, mxn: 19.1, cop: 4100, uyu: 40.5, eur: 0.87, ves: 100 } },
    [CDN('2025-01-10')]: { date: '2025-01-10', usd: { ars: 1040, mxn: 20.5, cop: 4400 } },
    'https://api.frankfurter.app/2023-05-02?from=USD': { date: '2023-05-02', rates: { MXN: 17.9, EUR: 0.91 } },
    'https://dolarapi.com/v1/dolares': [
      { moneda: 'USD', casa: 'oficial', compra: 1150, venta: 1200, fechaActualizacion: '2025-06-20T14:00:00Z' },
      { moneda: 'USD', casa: 'bolsa', compra: 1190, venta: 1210, fechaActualizacion: '2025-06-20T14:00:00Z' },
      { moneda: 'USD', casa: 'blue', compra: 1200, venta: 1230, fechaActualizacion: '2025-06-20T14:00:00Z' },
    ],
    'https://ve.dolarapi.com/v1/dolares': [
      { casa: 'oficial', promedio: 101.5, fechaActualizacion: '2025-06-20T14:00:00Z' },
      { casa: 'paralelo', promedio: 140, fechaActualizacion: '2025-06-20T14:00:00Z' },
    ],
    'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa': [
      { casa: 'bolsa', compra: 1080, venta: 1100, fecha: '2025-01-09' },
      { casa: 'bolsa', compra: 1090, venta: 1110, fecha: '2025-01-10' },
    ],
    'https://api.argentinadatos.com/v1/cotizaciones/dolares/blue': [{ casa: 'blue', compra: 1200, venta: 1250, fecha: '2025-01-10' }],
  };

  it('aplica el dólar elegido para Argentina y el oficial para Venezuela', async () => {
    const provider = new PublicFxProvider(fakeFetch(routes), undefined, today);
    const snap = await provider.latest();
    expect(snap.source).toBe('live');
    expect(snap.rates.ARS).toBe(1210); // MEP por defecto
    expect(snap.rates.MXN).toBe(19.1);
    expect(snap.rates.VES).toBe(101.5);
    expect(snap.variants.ARS?.blue?.sell).toBe(1230);
    const blue = await provider.latest({ ARS: 'blue' });
    expect(blue.rates.ARS).toBe(1230);
  });

  it('obtiene cotizaciones históricas y usa la serie del dólar elegido', async () => {
    const provider = new PublicFxProvider(fakeFetch(routes), undefined, today);
    const hist = await provider.on(['2025-01-10', '2025-01-10T12:00:00Z'], ['ARS', 'MXN', 'USD']);
    expect(hist).toEqual({ '2025-01-10': { ARS: 1110, MXN: 20.5 } });
    const blue = await provider.on(['2025-01-10'], ['ARS'], { ARS: 'blue' });
    expect(blue['2025-01-10']!.ARS).toBe(1250);
  });

  it('recurre al BCE para fechas sin datos en currency-api', async () => {
    const provider = new PublicFxProvider(fakeFetch(routes), undefined, today);
    const hist = await provider.on(['2023-05-02'], ['MXN', 'EUR']);
    expect(hist['2023-05-02']).toEqual({ MXN: 17.9, EUR: 0.91 });
  });

  it('cachea las cotizaciones de días pasados', async () => {
    const calls: string[] = [];
    const cache = memoryCache();
    const provider = new PublicFxProvider(fakeFetch(routes, calls), cache, today);
    await provider.on(['2025-01-10'], ['MXN']);
    const first = calls.length;
    await provider.on(['2025-01-10'], ['MXN']);
    expect(calls.length).toBe(first);
  });

  it('sin conexión usa valores de referencia y lo informa', async () => {
    const provider = new PublicFxProvider(fakeFetch({}), undefined, today);
    const snap = await provider.latest();
    expect(snap.source).toBe('fallback');
    expect(snap.rates.ARS).toBeGreaterThan(0);
  });

  it('muestrea fechas semanales incluyendo la última', () => {
    expect(weeklyDates('2025-01-01', '2025-01-20')).toEqual(['2025-01-01', '2025-01-08', '2025-01-15', '2025-01-20']);
  });
});
