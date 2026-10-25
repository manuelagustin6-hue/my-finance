// Edge Function: recibe los eventos de RevenueCat y actualiza el plan del usuario.
// En RevenueCat, el App User ID debe ser el id de usuario de Supabase (se configura en la app).
// Configurar en RevenueCat → Integrations → Webhooks el encabezado
// "Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>".
import { PRO_ENTITLEMENT } from '../_shared/core/index.ts';
import { adminClient, json } from '../_shared/supabase.ts';

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  product_id?: string;
  store?: string;
  period_type?: string;
  expiration_at_ms?: number | null;
}

/** Eventos que dejan la suscripción activa hasta `expiration_at_ms`. */
const ACTIVE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  // La cancelación mantiene el acceso hasta el vencimiento; solo deja de renovar.
  'CANCELLATION',
  'BILLING_ISSUE',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveUserId(event: RevenueCatEvent): string | undefined {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  return candidates.find((id): id is string => !!id && UUID_RE.test(id));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return json({ error: 'UNAUTHORIZED' }, 401);
  }

  const payload = (await req.json().catch(() => null)) as { event?: RevenueCatEvent } | null;
  const event = payload?.event;
  if (!event) return json({ error: 'INVALID_PAYLOAD' }, 400);
  if (event.type === 'TEST') return json({ ok: true });

  const userId = resolveUserId(event);
  if (!userId) return json({ ok: true, ignored: 'anonymous_user' });

  const grantsPro = (event.entitlement_ids ?? [PRO_ENTITLEMENT]).includes(PRO_ENTITLEMENT);
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
  const active = ACTIVE_EVENTS.has(event.type) && grantsPro;

  const { error } = await adminClient()
    .from('subscriptions')
    .upsert({
      user_id: userId,
      plan: active ? 'pro' : 'free',
      entitlement: grantsPro ? PRO_ENTITLEMENT : null,
      product_id: event.product_id ?? null,
      store: event.store ?? null,
      period_type: event.period_type ?? null,
      expires_at: expiresAt,
      will_renew: !['CANCELLATION', 'EXPIRATION'].includes(event.type),
      last_event: event.type,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error(error);
    // 500 hace que RevenueCat reintente el envío.
    return json({ error: 'DB_ERROR' }, 500);
  }
  return json({ ok: true });
});
