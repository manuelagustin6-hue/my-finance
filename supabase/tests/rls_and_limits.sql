-- Pruebas de RLS y límites del plan Gratis. Se ejecutan con psql -v ON_ERROR_STOP=1.
\set u1 '11111111-1111-1111-1111-111111111111'
\set u2 '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, email) values (:'u1', 'uno@example.com'), (:'u2', 'dos@example.com');
insert into public.assets (id, symbol, name, type, currency, provider, provider_id)
select gen_random_uuid(), 'A' || g, 'Activo ' || g, 'stock', 'USD', 'mock', 'A' || g from generate_series(1, 20) g;

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'se crean perfiles al registrarse';
end $$;

-- Usuario 1 opera con RLS
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.wallets (name, type, fee_percent, fee_fixed, fee_minimum) values ('Binance', 'exchange', 0.1, 0, 0);
insert into public.wallets (name, type) values ('Broker local', 'broker');

do $$ begin
  begin
    insert into public.wallets (name) values ('Tercera');
    raise exception 'debió fallar';
  exception when others then
    assert sqlerrm = 'PLAN_LIMIT_WALLETS', 'límite de billeteras: ' || sqlerrm;
  end;
end $$;

-- 15 activos distintos permitidos, el 16.º no
insert into public.transactions (wallet_id, asset_id, type, quantity, price, currency, executed_at)
select (select id from public.wallets where name = 'Binance'), a.id, 'buy', 1, 10, 'USD', now()
from public.assets a where a.symbol in (select 'A' || g from generate_series(1, 15) g);

do $$ begin
  -- repetir un activo existente está permitido
  insert into public.transactions (wallet_id, asset_id, type, quantity, price, currency, executed_at)
  select (select id from public.wallets where name = 'Binance'), a.id, 'buy', 1, 10, 'USD', now()
  from public.assets a where a.symbol = 'A1';
  begin
    insert into public.transactions (wallet_id, asset_id, type, quantity, price, currency, executed_at)
    select (select id from public.wallets where name = 'Binance'), a.id, 'buy', 1, 10, 'USD', now()
    from public.assets a where a.symbol = 'A16';
    raise exception 'debió fallar';
  exception when others then
    assert sqlerrm = 'PLAN_LIMIT_ASSETS', 'límite de activos: ' || sqlerrm;
  end;
end $$;

insert into public.import_jobs (template) values ('generic');
do $$ begin
  begin
    insert into public.import_jobs (template) values ('generic');
    raise exception 'debió fallar';
  exception when others then
    assert sqlerrm = 'PLAN_LIMIT_IMPORTS', 'límite de importaciones: ' || sqlerrm;
  end;
end $$;

-- Usuario 2 no ve nada del usuario 1 ni puede usar su billetera
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.wallets) = 0, 'RLS billeteras';
  assert (select count(*) from public.transactions) = 0, 'RLS operaciones';
  assert (select count(*) from public.profiles) = 1, 'RLS perfiles';
  assert (select count(*) from public.assets) = 20, 'catálogo global visible';
end $$;

reset role;
do $$
declare w uuid;
begin
  select id into w from public.wallets where name = 'Binance';
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  begin
    insert into public.transactions (user_id, wallet_id, asset_id, type, quantity, price, currency, executed_at)
    values (auth.uid(), w, (select id from public.assets limit 1), 'buy', 1, 1, 'USD', now());
    raise exception 'debió fallar';
  exception when others then
    assert sqlerrm = 'La billetera no pertenece al usuario', 'billetera ajena: ' || sqlerrm;
  end;
end $$;
reset role;

-- Con plan Pro no hay límites
insert into public.subscriptions (user_id, plan, expires_at) values ('11111111-1111-1111-1111-111111111111', 'pro', now() + interval '30 days');
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.wallets (name) values ('Tercera');
insert into public.import_jobs (template) values ('binance');
do $$ begin
  assert public.current_plan() = 'pro', 'plan pro';
  assert (select count(*) from public.wallets) = 3, 'pro sin límite de billeteras';
end $$;
reset role;

-- Suscripción vencida vuelve a Gratis
update public.subscriptions set expires_at = now() - interval '1 day';
do $$ begin
  assert public.current_plan('11111111-1111-1111-1111-111111111111') = 'free', 'vencida → free';
end $$;

-- Eliminación de cuenta
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.delete_my_account();
reset role;
do $$ begin
  assert (select count(*) from auth.users) = 1, 'usuario eliminado';
  assert (select count(*) from public.wallets) = 0, 'billeteras eliminadas en cascada';
  assert (select count(*) from public.transactions) = 0, 'operaciones eliminadas en cascada';
end $$;

\echo 'OK: todas las pruebas de base de datos pasaron'
