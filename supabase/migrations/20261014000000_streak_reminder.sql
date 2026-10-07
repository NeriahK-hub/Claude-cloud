-- Wallo : le rappel du soir parle de la série (« Ta série de 6 jours s'arrête ce soir »)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261010000000_reminders.sql). La tâche de 20 h est déjà dans supabase/push_cron.sql : rien à changer.
--
-- Série = jours de suite (heure de Kinshasa) où la personne a noté au moins une opération, comme dans l'app
-- (Accueil › Séries et badges). On compte jusqu'à hier : si rien n'est noté aujourd'hui, elle s'arrête à minuit.

create or replace function public.streak_until_yesterday(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  with d as (
    select distinct (t.occurred_at at time zone 'Africa/Kinshasa')::date as day
      from transactions t
     where t.created_by = p_user
       and t.deleted_at is null
       and t.occurred_at >= now() - interval '400 days'
       and (t.occurred_at at time zone 'Africa/Kinshasa')::date < (now() at time zone 'Africa/Kinshasa')::date
  ),
  r as (
    select day, day - (row_number() over (order by day))::int as grp from d
  )
  select coalesce((
    select count(*)::int from r
     where grp = (select grp from r where day = (now() at time zone 'Africa/Kinshasa')::date - 1)
  ), 0);
$$;
revoke execute on function public.streak_until_yesterday(uuid) from public, anon, authenticated;

create or replace function public.push_daily_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := date_trunc('day', now() at time zone 'Africa/Kinshasa') at time zone 'Africa/Kinshasa';
  u record;
  n integer;
  sent integer := 0;
begin
  for u in
    select p.id from profiles p
     where p.remind_daily
       and not exists (select 1 from transactions t where t.created_by = p.id and t.updated_at >= since)
  loop
    n := streak_until_yesterday(u.id);
    if n >= 2 then
      perform push_notify(
        u.id,
        'Ta série de ' || n || ' jours s''arrête ce soir',
        'Note une dépense ou un revenu avant minuit pour garder ta flamme allumée.',
        'daily'
      );
    else
      perform push_notify(u.id, 'Wallo', 'Tu n''as rien noté aujourd''hui. Une dépense, un revenu ? Ça prend 10 secondes.', 'daily');
    end if;
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke execute on function public.push_daily_reminders() from public, anon, authenticated;
