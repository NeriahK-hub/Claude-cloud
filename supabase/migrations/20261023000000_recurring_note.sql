-- Opérations qui reviennent : une note libre (mémo). À exécuter dans le SQL Editor de Supabase.
-- Sans effet sur les lignes existantes.

alter table public.recurrings add column if not exists note text;
