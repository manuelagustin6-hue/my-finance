-- Plataforma del catálogo asociada a la billetera (Binance, IOL, etc.).
-- Nula cuando el usuario la creó a mano.
alter table public.wallets add column platform_id text check (platform_id is null or platform_id ~ '^[a-z0-9-]{1,40}$');
