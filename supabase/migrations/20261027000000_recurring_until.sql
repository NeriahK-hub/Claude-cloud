-- Operations qui reviennent : "jusqu'a" (dernier paiement). Vide = sans fin.
-- A executer dans le SQL Editor de Supabase (apres 20261026). Sans effet sur les lignes existantes.

alter table public.recurrings add column if not exists until_date date;
