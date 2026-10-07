-- Wallo : échéances des dettes et rappel du soir (notifications push)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261009000000_push.sql). Les tâches planifiées sont dans supabase/push_cron.sql.

-- ---------------------------------------------------------------------------
-- Échéance d'un prêt / d'un emprunt (« à rembourser le »)
-- ---------------------------------------------------------------------------

alter table public.transactions add column if not exists due_date date;

-- Chaque matin : la veille, le jour même et le lendemain de l'échéance (en retard), pour ce qui
-- reste à rembourser. Une dette = une personne (« Avec ») et un côté, chez la personne qui l'a notée.
-- Le tag est le même que celui de l'alerte de l'app (App.tsx) : jamais deux fois sur un téléphone.
create or replace function public.push_debt_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Africa/Kinshasa')::date;
  g record;
  lvl text;
  how_much text;
  sent integer := 0;
begin
  for g in
    with t as (
      select created_by,
             lower(trim(with_person)) as person,
             trim(with_person) as name,
             case when category_id in ('loan-given', 'loan-back') then 'receivable' else 'payable' end as side,
             category_id in ('loan-given', 'debt-taken') as grows,
             abs(amount) as amt,
             coalesce(interest, 0) as intr,
             currency,
             due_date
        from transactions
       where deleted_at is null
         and category_id in ('loan-given', 'loan-back', 'debt-taken', 'debt-repay')
         and coalesce(trim(with_person), '') <> ''
    )
    select created_by, side, person, min(name) as name,
           sum(case when grows then amt + intr else -amt end) as left_amt,
           count(distinct currency) as ncur, min(currency) as cur,
           min(due_date) filter (where grows and due_date between today - 1 and today + 1) as due
      from t
     group by created_by, side, person
  loop
    continue when g.due is null or g.left_amt <= 0.004;
    lvl := case when g.due = today + 1 then 'soon' when g.due = today then 'today' else 'late' end;
    how_much := case when g.ncur = 1 then push_money(g.left_amt, g.cur) else 'ce qui reste' end;
    perform push_notify(
      g.created_by,
      case lvl when 'late' then 'Remboursement en retard : ' else 'Remboursement ' || case lvl when 'soon' then 'demain' else 'aujourd''hui' end || ' : ' end || g.name,
      case when g.side = 'receivable'
        then g.name || ' doit te rendre ' || how_much || case lvl when 'late' then ' (la date est passée).' when 'soon' then ' demain.' else ' aujourd''hui.' end
        else 'Tu dois rendre ' || how_much || ' à ' || g.name || case lvl when 'late' then ' (la date est passée).' when 'soon' then ' demain.' else ' aujourd''hui.' end
      end,
      'debt-due-' || g.side || '-' || g.due || '-' || lvl || '-' || g.person
    );
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke execute on function public.push_debt_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rappel du soir : « Tu n'as rien noté aujourd'hui » (choisi dans Paramètres › Notifications)
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists remind_daily boolean not null default false;

create or replace function public.set_daily_reminder(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set remind_daily = coalesce(p_on, false) where id = auth.uid();
$$;
grant execute on function public.set_daily_reminder(boolean) to authenticated;

create or replace function public.push_daily_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := date_trunc('day', now() at time zone 'Africa/Kinshasa') at time zone 'Africa/Kinshasa';
  u record;
  sent integer := 0;
begin
  for u in
    select p.id from profiles p
     where p.remind_daily
       and not exists (select 1 from transactions t where t.created_by = p.id and t.updated_at >= since)
  loop
    perform push_notify(u.id, 'Wallo', 'Tu n''as rien noté aujourd''hui. Une dépense, un revenu ? Ça prend 10 secondes.', 'daily');
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke execute on function public.push_daily_reminders() from public, anon, authenticated;
