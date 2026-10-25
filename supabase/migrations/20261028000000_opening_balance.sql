-- Saldo inicial por billetera: tenencias a una fecha que sirven de punto de comparación.
-- La actividad hasta esa fecha inclusive se ignora en los cálculos.
alter type public.transaction_source add value if not exists 'opening';
alter table public.wallets add column opening_date date;
