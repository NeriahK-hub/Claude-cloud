-- Wallo : tâches planifiées des notifications push
-- À exécuter UNE fois dans Supabase (SQL Editor), APRÈS la migration 20261009000000_push.sql
-- et après avoir publié la fonction send-push. Ce n'est pas une migration : il contient des valeurs
-- propres à ton projet (remplace les deux REMPLACER_… avant de lancer).
--
-- 1) Extensions (aussi activables dans Database > Extensions)
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 2) L'adresse du projet et le mot de passe partagé avec send-push, rangés dans le coffre (Vault)
--    REMPLACER_URL : ex. https://abcdefgh.supabase.co (Project Settings > API)
--    REMPLACER_SECRET : la même valeur que PUSH_SECRET donnée à « supabase secrets set »
select vault.create_secret('REMPLACER_URL', 'wallo_project_url');
select vault.create_secret('REMPLACER_SECRET', 'wallo_push_secret');

-- 3) Chaque minute : envoyer ce qui attend (seulement s'il y a quelque chose)
select cron.schedule(
  'wallo-push-send',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'wallo_project_url') || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'wallo_push_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.push_queue where sent_at is null);
  $$
);

-- 4) Chaque matin à 8 h (heure de Kinshasa = 7 h UTC) : rappels de ristourne et d'échéances de dettes, puis ménage
--    (push_debt_reminders vient de la migration 20261010000000_reminders.sql)
select cron.schedule('wallo-ristourne-reminders', '0 7 * * *', $$ select public.push_ristourne_reminders(); select public.push_debt_reminders(); select public.push_cleanup(); $$);

-- 5) Chaque soir à 20 h (19 h UTC) : « Tu n'as rien noté aujourd'hui » pour ceux qui l'ont choisi
select cron.schedule('wallo-daily-reminder', '0 19 * * *', $$ select public.push_daily_reminders(); $$);

-- 6) Chaque matin à 8 h (7 h UTC) : rappels des objectifs (« C'est vendredi : mets 10 $ dans Moto »)
--    (push_goal_reminders vient de la migration 20261011000000_goals.sql ; si les étapes 1 à 5 sont déjà faites,
--    lance seulement cette ligne)
select cron.schedule('wallo-goal-reminders', '0 7 * * *', $$ select public.push_goal_reminders(); $$);

-- 7) Chaque matin à 8 h (7 h UTC) : factures et opérations qui reviennent
--    (push_recurring_reminders vient de la migration 20261012000000_upcoming.sql ; lance seulement cette ligne
--    si les étapes précédentes sont déjà faites)
select cron.schedule('wallo-recurring-reminders', '0 7 * * *', $$ select public.push_recurring_reminders(); $$);

-- Pour vérifier : select * from cron.job;  Historique : select * from cron.job_run_details order by start_time desc limit 20;
-- Pour arrêter : select cron.unschedule('wallo-push-send'); select cron.unschedule('wallo-ristourne-reminders'); select cron.unschedule('wallo-daily-reminder'); select cron.unschedule('wallo-goal-reminders'); select cron.unschedule('wallo-recurring-reminders');
