-- Esquema inicial: perfiles, billeteras, activos, operaciones, importaciones,
-- suscripciones y caché de datos de mercado. Toda tabla de usuario tiene RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.asset_type as enum ('crypto', 'stock', 'etf', 'bond', 'fund', 'cash', 'other');
create type public.wallet_type as enum ('exchange', 'broker', 'bank', 'self_custody', 'other');
create type public.transaction_type as enum (
  'buy', 'sell', 'deposit', 'withdraw', 'transfer_in', 'transfer_out', 'dividend', 'interest', 'fee', 'split'
);
create type public.transaction_source as enum ('manual', 'csv', 'api');
create type public.plan_id as enum ('free', 'pro');

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  base_currency text not null default 'USD' check (base_currency ~ '^[A-Z]{3,5}$'),
  locale text not null default 'es',
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Crea el perfil al registrarse.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Suscripciones (sincronizadas desde RevenueCat por la Edge Function del webhook)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan public.plan_id not null default 'free',
  entitlement text,
  product_id text,
  store text,
  period_type text,
  expires_at timestamptz,
  will_renew boolean,
  last_event text,
  updated_at timestamptz not null default now()
);

-- Plan vigente del usuario: Pro solo si la suscripción no venció.
create function public.current_plan(uid uuid default auth.uid()) returns public.plan_id
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select 'pro'::public.plan_id from public.subscriptions s
      where s.user_id = uid and s.plan = 'pro' and (s.expires_at is null or s.expires_at > now())),
    'free'::public.plan_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Billeteras
-- ---------------------------------------------------------------------------
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type public.wallet_type not null default 'other',
  currency text not null default 'USD',
  fee_percent numeric(10, 6) not null default 0 check (fee_percent >= 0 and fee_percent < 100),
  fee_fixed numeric(20, 8) not null default 0 check (fee_fixed >= 0),
  fee_minimum numeric(20, 8) not null default 0 check (fee_minimum >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wallets_user_idx on public.wallets (user_id);

-- ---------------------------------------------------------------------------
-- Activos. owner_id nulo = catálogo global (lo escribe el servidor);
-- con owner_id = activo personalizado del usuario (p. ej. un bono sin cotización).
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  symbol text not null,
  name text not null,
  type public.asset_type not null,
  currency text not null,
  exchange text,
  country text,
  provider text,
  provider_id text,
  manual_price numeric(28, 10),
  created_at timestamptz not null default now()
);
create unique index assets_global_provider_uidx on public.assets (provider, provider_id) where owner_id is null;
create unique index assets_owner_symbol_uidx on public.assets (owner_id, symbol, type) where owner_id is not null;
create index assets_symbol_idx on public.assets (upper(symbol));

-- ---------------------------------------------------------------------------
-- Operaciones
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete restrict,
  type public.transaction_type not null,
  quantity numeric(38, 18) not null default 0 check (quantity >= 0),
  price numeric(28, 10) not null default 0 check (price >= 0),
  amount numeric(28, 10),
  fee numeric(28, 10) not null default 0 check (fee >= 0),
  currency text not null,
  fx_rate numeric(28, 10) check (fx_rate is null or fx_rate > 0),
  executed_at timestamptz not null,
  note text,
  source public.transaction_source not null default 'manual',
  external_id text,
  import_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transactions_user_date_idx on public.transactions (user_id, executed_at);
create index transactions_wallet_idx on public.transactions (wallet_id);
create unique index transactions_external_uidx on public.transactions (wallet_id, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- Importaciones
-- ---------------------------------------------------------------------------
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  wallet_id uuid references public.wallets (id) on delete set null,
  template text not null,
  file_name text,
  rows_total integer not null default 0,
  rows_imported integer not null default 0,
  rows_skipped integer not null default 0,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.transactions
  add constraint transactions_import_job_fk foreign key (import_job_id) references public.import_jobs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Caché de datos de mercado (solo la escriben las Edge Functions con service role)
-- ---------------------------------------------------------------------------
create table public.prices_cache (
  provider text not null,
  provider_id text not null,
  price numeric(28, 10) not null,
  previous_close numeric(28, 10),
  currency text not null,
  as_of timestamptz not null,
  fetched_at timestamptz not null default now(),
  primary key (provider, provider_id)
);

create table public.price_history (
  provider text not null,
  provider_id text not null,
  date date not null,
  close numeric(28, 10) not null,
  primary key (provider, provider_id, date)
);

create table public.fx_rates (
  base text not null,
  quote text not null,
  date date not null,
  rate numeric(28, 12) not null check (rate > 0),
  primary key (base, quote, date)
);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger wallets_touch before update on public.wallets for each row execute function public.touch_updated_at();
create trigger transactions_touch before update on public.transactions for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Límites del plan Gratis (deben coincidir con packages/core/src/plans.ts)
-- ---------------------------------------------------------------------------
create function public.enforce_wallet_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.current_plan(new.user_id) = 'free'
     and (select count(*) from public.wallets w where w.user_id = new.user_id and not w.archived) >= 2 then
    raise exception 'PLAN_LIMIT_WALLETS' using hint = 'El plan Gratis permite hasta 2 billeteras.';
  end if;
  return new;
end;
$$;
create trigger wallets_limit before insert on public.wallets for each row execute function public.enforce_wallet_limit();

create function public.enforce_asset_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.current_plan(new.user_id) = 'free'
     and not exists (select 1 from public.transactions t where t.user_id = new.user_id and t.asset_id = new.asset_id)
     and (select count(distinct t.asset_id) from public.transactions t where t.user_id = new.user_id) >= 15 then
    raise exception 'PLAN_LIMIT_ASSETS' using hint = 'El plan Gratis permite hasta 15 activos.';
  end if;
  return new;
end;
$$;
create trigger transactions_asset_limit before insert on public.transactions for each row execute function public.enforce_asset_limit();

create function public.enforce_import_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.current_plan(new.user_id) = 'free'
     and (select count(*) from public.import_jobs j where j.user_id = new.user_id) >= 1 then
    raise exception 'PLAN_LIMIT_IMPORTS' using hint = 'El plan Gratis permite 1 importación.';
  end if;
  return new;
end;
$$;
create trigger import_jobs_limit before insert on public.import_jobs for each row execute function public.enforce_import_limit();

-- Una operación solo puede referir a una billetera propia y a un activo visible para el usuario.
create function public.check_transaction_refs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.wallets w where w.id = new.wallet_id and w.user_id = new.user_id) then
    raise exception 'La billetera no pertenece al usuario';
  end if;
  if not exists (select 1 from public.assets a where a.id = new.asset_id and (a.owner_id is null or a.owner_id = new.user_id)) then
    raise exception 'Activo inválido';
  end if;
  return new;
end;
$$;
create trigger transactions_refs before insert or update on public.transactions for each row execute function public.check_transaction_refs();

-- ---------------------------------------------------------------------------
-- Eliminación de cuenta (requisito de App Store)
-- ---------------------------------------------------------------------------
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  delete from public.assets where owner_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.wallets enable row level security;
alter table public.assets enable row level security;
alter table public.transactions enable row level security;
alter table public.import_jobs enable row level security;
alter table public.prices_cache enable row level security;
alter table public.price_history enable row level security;
alter table public.fx_rates enable row level security;

create policy "perfil propio: leer" on public.profiles for select to authenticated using (id = auth.uid());
create policy "perfil propio: editar" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- La suscripción solo se lee; la escribe el webhook con service role.
create policy "suscripción propia: leer" on public.subscriptions for select to authenticated using (user_id = auth.uid());

create policy "billeteras propias" on public.wallets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "activos: leer catálogo y propios" on public.assets for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
create policy "activos propios: crear" on public.assets for insert to authenticated with check (owner_id = auth.uid());
create policy "activos propios: editar" on public.assets for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "activos propios: borrar" on public.assets for delete to authenticated using (owner_id = auth.uid());

create policy "operaciones propias" on public.transactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "importaciones propias" on public.import_jobs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "precios: leer" on public.prices_cache for select to authenticated using (true);
create policy "historia: leer" on public.price_history for select to authenticated using (true);
create policy "tipos de cambio: leer" on public.fx_rates for select to authenticated using (true);
