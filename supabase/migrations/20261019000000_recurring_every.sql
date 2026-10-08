-- Opérations qui reviennent : « toutes les 2 semaines », « tous les 3 mois », « tous les 2 ans »
-- every_n = le N (absent / 1 = chaque semaine, mois ou année). Pour 'days', c'est toujours every_days.
-- À exécuter dans le SQL Editor de Supabase. Sans effet sur les lignes existantes.

alter table public.recurrings add column if not exists every_n integer check (every_n between 1 and 60);
