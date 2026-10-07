-- Wallo : portefeuilles objectifs (« Pourquoi », rappel de la semaine, arrondis, notification enrichie)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261010000000_reminders.sql). Puis la tâche planifiée « wallo-goal-reminders » de supabase/push_cron.sql.

-- ---------------------------------------------------------------------------
-- Nouvelles informations d'un objectif
-- ---------------------------------------------------------------------------

alter table public.wallets add column if not exists goal_why text;                -- « Pour aller au travail sans payer le taxi-moto »
alter table public.wallets add column if not exists reminder_day smallint          -- 0 dimanche … 6 samedi (null = pas de rappel)
  check (reminder_day between 0 and 6);
alter table public.wallets add column if not exists reminder_amount numeric        -- montant proposé dans le rappel
  check (reminder_amount > 0);
alter table public.wallets add column if not exists round_up boolean not null default false; -- reçoit les arrondis des dépenses

-- ---------------------------------------------------------------------------
-- Notification d'une opération dans un portefeuille partagé :
-- pour un objectif, un dépôt devient « Grace a ajouté 20 $ à Mariage (45 %) »
-- ---------------------------------------------------------------------------

create or replace function public.push_on_transaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w record;
  m record;
  who text;
  body text;
  saved numeric;
begin
  if new.deleted_at is not null or new.occurred_at < now() - interval '3 days' or new.type = 'adjustment' then
    return null;
  end if;
  select id, name, kind, goal_amount, initial_balance into w from wallets where id = new.wallet_id;
  who := person_name(new.created_by);
  if w.kind = 'goal' and new.amount > 0 and coalesce(w.goal_amount, 0) > 0 then
    select w.initial_balance + coalesce(sum(t.amount), 0) into saved
      from transactions t where t.wallet_id = w.id and t.deleted_at is null;
    body := who || ' a ajouté ' || push_money(new.amount, new.currency) || ' à ' || w.name
      || ' (' || least(999, greatest(0, round(saved / w.goal_amount * 100)))::int || ' %)';
  else
    body := who || ' : ' || case when new.amount < 0 then '−' else '+' end || push_money(new.amount, new.currency)
      || coalesce(' · ' || nullif(trim(new.title), ''), '');
  end if;
  for m in
    select distinct user_id from wallet_members
     where wallet_id = new.wallet_id and status = 'active' and deleted_at is null
       and user_id is not null and user_id is distinct from new.created_by
  loop
    perform push_notify(m.user_id, w.name, body, 'wallet-' || w.id);
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Rappel de la semaine : « C'est vendredi : mets 10 $ dans Moto »
-- Chaque matin : les objectifs dont c'est le jour, pas encore atteints, où l'on a mis moins que prévu depuis lundi.
-- Envoyé au propriétaire et aux membres qui ont un compte. Le tag est le même que l'alerte de
-- l'app (App.tsx) : jamais deux fois sur un téléphone. Toucher la notification ouvre le dépôt.
-- ---------------------------------------------------------------------------

create or replace function public.push_goal_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Africa/Kinshasa')::date;
  week_start timestamptz := (date_trunc('week', today::timestamp)) at time zone 'Africa/Kinshasa';
  g record;
  u uuid;
  sent integer := 0;
  day_name text;
begin
  day_name := (array['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'])[extract(dow from today)::int + 1];
  for g in
    select * from (
      select w.id, w.name, w.owner_id, w.currency, w.goal_amount, w.reminder_amount, w.goal_why,
             w.initial_balance + coalesce((select sum(t.amount) from transactions t where t.wallet_id = w.id and t.deleted_at is null), 0) as saved,
             coalesce((select sum(t.amount) from transactions t
                        where t.wallet_id = w.id and t.deleted_at is null and t.amount > 0 and t.occurred_at >= week_start), 0) as put
        from wallets w
       where w.deleted_at is null and not w.archived and w.kind = 'goal'
         and w.reminder_day = extract(dow from today)::int and w.reminder_amount > 0
    ) x
    where x.put < x.reminder_amount
  loop
    continue when g.goal_amount is not null and g.saved >= g.goal_amount;
    for u in
      select g.owner_id
      union
      select user_id from wallet_members
       where wallet_id = g.id and status = 'active' and deleted_at is null and user_id is not null
    loop
      perform push_notify(
        u,
        g.name,
        'C''est ' || day_name || ' : mets ' || push_money(least(g.reminder_amount - g.put, coalesce(g.goal_amount - g.saved, g.reminder_amount)), g.currency) || ' dans ' || g.name || '.'
          || coalesce(' ' || nullif(trim(g.goal_why), ''), ''),
        'goal-reminder-' || g.id || '-' || today,
        '/?goal=' || g.id || '&deposit=' || round(least(g.reminder_amount - g.put, coalesce(g.goal_amount - g.saved, g.reminder_amount)), 2)
      );
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end $$;
revoke execute on function public.push_goal_reminders() from public, anon, authenticated;
