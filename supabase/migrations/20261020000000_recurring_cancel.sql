-- Opérations qui reviennent : « à résilier » (rappel pour annuler un abonnement avant l'échéance)
-- cancel_by = la date du rappel. À exécuter dans le SQL Editor de Supabase. Sans effet sur les lignes existantes.

alter table public.recurrings add column if not exists cancel_by date;
