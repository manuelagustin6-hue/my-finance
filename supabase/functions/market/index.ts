// Edge Function: datos de mercado (búsqueda, cotizaciones, historia, fundamentales, tipos de cambio).
// Oculta las claves de los proveedores, aplica los límites del plan y cachea cotizaciones.
import {
  hasFeature,
  MockMarketDataProvider,
  PLANS,
  RANGE_DAYS,
  type AssetRef,
  type HistoryRange,
  type MarketDataProvider,
  type PlanId,
  type Quote,
} from '../_shared/core/index.ts';
import { adminClient, corsHeaders, json, requireUser } from '../_shared/supabase.ts';

const QUOTE_TTL_SECONDS = 60;

/**
 * Proveedor activo. Cuando se elijan los proveedores reales, se combinan aquí con
 * CompositeProvider (p. ej. uno para cripto y otro para acciones) según las claves configuradas.
 */
function buildProvider(): MarketDataProvider {
  return new MockMarketDataProvider();
}

const provider = buildProvider();

type Body =
  | { action: 'search'; query: string; limit?: number }
  | { action: 'quotes'; assets: AssetRef[] }
  | { action: 'history'; asset: AssetRef; range: HistoryRange }
  | { action: 'fundamentals'; asset: AssetRef }
  | { action: 'fx'; base: string; currencies: string[] };

async function planOf(userId: string): Promise<PlanId> {
  const { data } = await adminClient().rpc('current_plan', { uid: userId });
  return data === 'pro' ? 'pro' : 'free';
}

async function cachedQuotes(assets: AssetRef[]): Promise<Quote[]> {
  const db = adminClient();
  const ids = assets.map((a) => a.providerId);
  const since = new Date(Date.now() - QUOTE_TTL_SECONDS * 1000).toISOString();
  const { data: cached } = await db
    .from('prices_cache')
    .select('provider_id, price, previous_close, currency, as_of')
    .eq('provider', provider.id)
    .in('provider_id', ids)
    .gte('fetched_at', since);

  const fresh = new Map<string, Quote>(
    (cached ?? []).map((r) => [
      r.provider_id,
      {
        assetId: r.provider_id,
        price: Number(r.price),
        previousClose: r.previous_close === null ? undefined : Number(r.previous_close),
        currency: r.currency,
        asOf: r.as_of,
      },
    ]),
  );
  const missing = assets.filter((a) => !fresh.has(a.providerId));
  if (missing.length > 0) {
    const quotes = await provider.getQuotes(missing);
    for (const q of quotes) fresh.set(q.assetId, q);
    if (quotes.length > 0) {
      await db.from('prices_cache').upsert(
        quotes.map((q) => ({
          provider: provider.id,
          provider_id: q.assetId,
          price: q.price,
          previous_close: q.previousClose ?? null,
          currency: q.currency,
          as_of: q.asOf,
          fetched_at: new Date().toISOString(),
        })),
      );
    }
  }
  return [...fresh.values()];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const userId = await requireUser(req);
  if (!userId) return json({ error: 'UNAUTHORIZED' }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  try {
    switch (body.action) {
      case 'search':
        return json(await provider.search(String(body.query ?? ''), Math.min(body.limit ?? 20, 50)));

      case 'quotes': {
        const assets = (body.assets ?? []).slice(0, 200);
        return json(await cachedQuotes(assets));
      }

      case 'history': {
        const plan = await planOf(userId);
        if (RANGE_DAYS[body.range] > PLANS[plan].maxHistoryDays) {
          return json({ error: 'PRO_REQUIRED', feature: 'full_price_history' }, 402);
        }
        return json(await provider.getHistory(body.asset, body.range));
      }

      case 'fundamentals': {
        const plan = await planOf(userId);
        if (!hasFeature(plan, 'fundamentals')) return json({ error: 'PRO_REQUIRED', feature: 'fundamentals' }, 402);
        return json(await provider.getFundamentals(body.asset));
      }

      case 'fx':
        return json(await provider.getFxRates(body.base, body.currencies ?? []));

      default:
        return json({ error: 'UNKNOWN_ACTION' }, 400);
    }
  } catch (error) {
    console.error(error);
    return json({ error: 'PROVIDER_ERROR' }, 502);
  }
});
