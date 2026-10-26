import { describe, expect, it } from 'vitest';
import {
  CoinGeckoProvider,
  COINGECKO_BASE,
  Data912Provider,
  DATA912_BASE,
  legacyProviderId,
  PrefixRouterProvider,
  type KeyValueCache,
} from '../src/index.ts';

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    const body = routes[url];
    return { ok: body !== undefined, status: body !== undefined ? 200 : 404, json: async () => body };
  };
}

function memoryCache(): KeyValueCache {
  const store = new Map<string, string>();
  return { get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) };
}

const now = () => new Date('2026-10-26T15:00:00Z');

const D912: Record<string, unknown> = {
  [`${DATA912_BASE}/live/arg_stocks`]: [
    { symbol: 'GGAL', c: 6500, pct_change: 2.5, px_bid: 6490, px_ask: 6510, v: 1000 },
    { symbol: 'YPFD', c: 40000, pct_change: -1 },
  ],
  [`${DATA912_BASE}/live/arg_cedears`]: [
    { symbol: 'AAPL', c: 15000, pct_change: 0 },
    { symbol: 'AAPLD', c: 12.5, pct_change: 0 },
    { symbol: 'AAPLC', c: 12.4, pct_change: 0 },
  ],
  [`${DATA912_BASE}/live/arg_bonds`]: [
    { symbol: 'AL30', c: 85300, pct_change: 1 },
    { symbol: 'AL30D', c: null, px_bid: 64, px_ask: 66, pct_change: null },
  ],
  [`${DATA912_BASE}/live/arg_notes`]: [],
  // arg_corp caído: no debe afectar al resto.
  [`${DATA912_BASE}/live/usa_stocks`]: [{ symbol: 'AAPL', c: 230, pct_change: -2 }],
  [`${DATA912_BASE}/live/usa_adrs`]: [{ symbol: 'GGAL', c: 50, pct_change: 3 }],
  [`${DATA912_BASE}/historical/bonds/AL30`]: [
    { date: '2024-01-02', o: 1, h: 1, l: 1, c: 20000, v: 1, dr: 0, sa: 0 },
    { date: '2026-10-23', o: 1, h: 1, l: 1, c: 84000, v: 1, dr: 0, sa: 0 },
    { date: '2026-10-22', o: 1, h: 1, l: 1, c: 83000, v: 1, dr: 0, sa: 0 },
    { date: '2026-10-24', c: null },
  ],
};

describe('data912', () => {
  it('normaliza paneles: tipo, moneda por sufijo, unidad y cierre anterior', async () => {
    const p = new Data912Provider(fakeFetch(D912), memoryCache(), now);
    const quotes = await p.getQuotes([
      { providerId: 'ar:GGAL', type: 'stock' },
      { providerId: 'ar:AL30', type: 'bond' },
      { providerId: 'ar:AL30D', type: 'bond' },
      { providerId: 'us:AAPL', type: 'stock' },
      { providerId: 'ar:NOEXISTE', type: 'stock' },
    ]);
    const q = Object.fromEntries(quotes.map((x) => [x.assetId, x]));
    expect(q['ar:GGAL']).toMatchObject({ price: 6500, currency: 'ARS', asOf: '2026-10-26' });
    expect(q['ar:GGAL']!.previousClose).toBeCloseTo(6500 / 1.025);
    expect(q['ar:GGAL']!.unit).toBeUndefined();
    expect(q['ar:AL30']).toMatchObject({ price: 85300, currency: 'ARS', unit: 100 });
    expect(q['ar:AL30D']).toMatchObject({ price: 65, currency: 'USD', unit: 100, previousClose: undefined });
    expect(q['us:AAPL']).toMatchObject({ price: 230, currency: 'USD' });
    expect(q['ar:NOEXISTE']).toBeUndefined();
  });

  it('busca en Argentina y EE. UU. sin mostrar las variantes cable', async () => {
    const p = new Data912Provider(fakeFetch(D912), memoryCache(), now);
    const aapl = await p.search('AAPL');
    expect(aapl.map((r) => [r.providerId, r.currency, r.name])).toEqual([
      ['ar:AAPL', 'ARS', 'CEDEAR Apple Inc.'],
      ['us:AAPL', 'USD', 'Apple Inc.'],
      ['ar:AAPLD', 'USD', 'CEDEAR Apple Inc.'],
    ]);
    const ggal = await p.search('ggal');
    expect(ggal[0]).toMatchObject({ providerId: 'ar:GGAL', type: 'stock', exchange: 'BYMA', country: 'AR', name: 'Grupo Financiero Galicia' });
    expect((await p.search('AL30')).map((r) => r.providerId)).toEqual(['ar:AL30', 'ar:AL30D']);
    expect((await p.search('AL30'))[0]).toMatchObject({ type: 'bond', name: 'Bono Rep. Argentina 2030 (Ley local)' });
    expect(await p.search('AAPLC')).toHaveLength(1);
  });

  it('historia de bonos por nominal, ordenada y recortada al rango', async () => {
    const calls: string[] = [];
    const p = new Data912Provider(fakeFetch(D912, calls), memoryCache(), now);
    const pts = await p.getHistory({ providerId: 'ar:AL30', type: 'bond' }, '1M');
    expect(pts).toEqual([
      { date: '2026-10-22', close: 83000, unit: 100 },
      { date: '2026-10-23', close: 84000, unit: 100 },
    ]);
    expect((await p.getHistory({ providerId: 'ar:AL30', type: 'bond' }, 'MAX')).length).toBe(3);
    // Sin histórico (EE. UU.) o con error: lista vacía, sin excepción.
    expect(await p.getHistory({ providerId: 'us:AAPL', type: 'stock' }, '1Y')).toEqual([]);
    expect(await p.getHistory({ providerId: 'ar:GGAL', type: 'stock' }, '1Y')).toEqual([]);
    expect(calls.filter((u) => u.endsWith('/historical/bonds/AL30'))).toHaveLength(1);
  });

  it('usa la caché entre consultas', async () => {
    const calls: string[] = [];
    const cache = memoryCache();
    await new Data912Provider(fakeFetch(D912, calls), cache, now).getQuotes([{ providerId: 'ar:GGAL', type: 'stock' }]);
    const ok = (list: string[]) => list.filter((u) => !u.endsWith('/arg_corp'));
    const before = ok(calls).length;
    await new Data912Provider(fakeFetch(D912, calls), cache, now).getQuotes([{ providerId: 'ar:GGAL', type: 'stock' }]);
    // Los paneles que respondieron se leen de la caché; el que falló se vuelve a intentar.
    expect(ok(calls).length).toBe(before);
    expect(calls.filter((u) => u.endsWith('/arg_corp'))).toHaveLength(2);
  });
});

const CG: Record<string, unknown> = {
  [`${COINGECKO_BASE}/search?query=btc`]: {
    coins: [
      { id: 'wrapped-bitcoin', name: 'Wrapped Bitcoin', symbol: 'WBTC', market_cap_rank: 20, large: 'https://x/wbtc.png' },
      { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', market_cap_rank: 1, large: 'https://x/btc.png' },
    ],
  },
  [`${COINGECKO_BASE}/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true`]: {
    bitcoin: { usd: 100000, usd_24h_change: 5 },
    ethereum: { usd: 4000, usd_24h_change: null },
  },
  [`${COINGECKO_BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=31&interval=daily`]: {
    prices: [
      [Date.parse('2026-10-24T00:00:00Z'), 98000],
      [Date.parse('2026-10-25T00:00:00Z'), 99000],
      [Date.parse('2026-10-25T14:00:00Z'), 99500],
    ],
  },
};

describe('CoinGecko', () => {
  it('busca con el símbolo exacto primero y con logo', async () => {
    const p = new CoinGeckoProvider(fakeFetch(CG), memoryCache(), now);
    const r = await p.search('BTC');
    expect(r[0]).toMatchObject({ providerId: 'cg:bitcoin', symbol: 'BTC', type: 'crypto', currency: 'USD', logoUrl: 'https://x/btc.png' });
    expect(await p.search('b')).toEqual([]);
  });

  it('cotiza en lote y arma la historia diaria', async () => {
    const p = new CoinGeckoProvider(fakeFetch(CG), memoryCache(), now);
    const q = await p.getQuotes([
      { providerId: 'cg:ethereum', type: 'crypto' },
      { providerId: 'cg:bitcoin', type: 'crypto' },
    ]);
    expect(q.find((x) => x.assetId === 'cg:bitcoin')!.previousClose).toBeCloseTo(100000 / 1.05);
    expect(q.find((x) => x.assetId === 'cg:ethereum')).toMatchObject({ price: 4000, previousClose: undefined });
    expect(await p.getHistory({ providerId: 'cg:bitcoin', type: 'crypto' }, '1M')).toEqual([
      { date: '2026-10-24', close: 98000 },
      { date: '2026-10-25', close: 99500 },
    ]);
  });
});

describe('enrutador por prefijo', () => {
  it('reparte por prefijo y aísla errores', async () => {
    const router = new PrefixRouterProvider([
      new Data912Provider(fakeFetch(D912), memoryCache(), now),
      new CoinGeckoProvider(fakeFetch({}), memoryCache(), now), // CoinGecko caído
    ]);
    const q = await router.getQuotes([
      { providerId: 'ar:GGAL', type: 'stock' },
      { providerId: 'cg:bitcoin', type: 'crypto' },
      { providerId: 'AAPL', type: 'stock' }, // id viejo sin prefijo
    ]);
    expect(q.map((x) => x.assetId)).toEqual(['ar:GGAL']);
    expect((await router.search('AAPL'))[0]!.providerId).toBe('ar:AAPL');
    expect(await router.getHistory({ providerId: 'xx:1', type: 'stock' }, '1M')).toEqual([]);
  });
});

describe('ids de los datos simulados', () => {
  it('se convierten al proveedor real', () => {
    const base = { exchange: undefined, country: undefined };
    expect(legacyProviderId({ ...base, providerId: 'BTC', symbol: 'BTC', type: 'crypto', currency: 'USD' })).toBe('cg:bitcoin');
    expect(legacyProviderId({ providerId: 'AL30', symbol: 'AL30', type: 'bond', currency: 'USD', exchange: 'BYMA', country: 'AR' })).toBe('ar:AL30D');
    expect(legacyProviderId({ providerId: 'GGAL', symbol: 'GGAL', type: 'stock', currency: 'ARS', exchange: 'BYMA', country: 'AR' })).toBe('ar:GGAL');
    expect(legacyProviderId({ providerId: 'AAPL', symbol: 'AAPL', type: 'stock', currency: 'USD', exchange: 'NASDAQ', country: 'US' })).toBe('us:AAPL');
    expect(legacyProviderId({ ...base, providerId: 'PETR4', symbol: 'PETR4', type: 'stock', currency: 'BRL' })).toBeUndefined();
    expect(legacyProviderId({ ...base, providerId: 'ar:GGAL', symbol: 'GGAL', type: 'stock', currency: 'ARS' })).toBeUndefined();
  });
});
