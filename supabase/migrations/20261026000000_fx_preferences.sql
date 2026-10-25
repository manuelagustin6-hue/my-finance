-- Preferencias de moneda: moneda secundaria para ver la cartera (por defecto USD)
-- y tipo de dólar elegido en mercados con varias cotizaciones (Argentina, Venezuela).
alter table public.profiles
  add column secondary_currency text not null default 'USD' check (secondary_currency ~ '^[A-Z]{3,5}$'),
  add column fx_preferences jsonb not null default '{}'::jsonb;

-- Caché clave/valor de cotizaciones obtenidas de fuentes públicas.
-- Solo la usan las Edge Functions con service role (sin políticas para usuarios).
create table public.fx_cache (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.fx_cache enable row level security;

-- La tabla fx_rates del esquema inicial queda reemplazada por fx_cache.
drop table public.fx_rates;
