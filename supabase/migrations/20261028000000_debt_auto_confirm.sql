-- Wallo : dettes partagees - rappels et confirmation tacite apres 7 jours
-- A executer dans Supabase > SQL Editor apres 20261027000000_recurring_until.sql, puis l'etape 8 de supabase/push_cron.sql.
--
-- Principe
-- * Un mouvement note par l'un attend la confirmation de l'autre (pending). Si l'autre n'ouvre
--   pas l'app, il est relance : une notification apres 1 jour, une autre apres 3 jours.
-- * Apres 7 jours sans reponse (ni confirme, ni refuse), le mouvement est confirme tout seul
--   (auto_confirmed). Les deux sont prevenus. Ensuite, comme tout mouvement confirme, il ne
--   disparait que si les deux sont d'accord.
-- * Le delai part de l'enregistrement (pending_since), pas de la date choisie pour le mouvement ;
--   il repart de zero si celui qui l'a note change le montant, le sens ou la devise.

alter table public.debt_moves add column if not exists pending_since timestamptz not null default now();
alter table public.debt_moves add column if not exists auto_confirmed boolean not null default false;
alter table public.debt_moves add column if not exists reminders smallint not null default 0; -- relances deja envoyees

-- Ce qui attend deja : 7 jours pleins a partir d'aujourd'hui (et la date arrive sur les telephones a la synchro)
update public.debt_moves set pending_since = now() where pending and deleted_at is null;

-- Ces trois colonnes ne bougent que par le serveur (passe apres debt_moves_guard : ordre alphabetique)
create or replace function public.guard_debt_move_wait() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from debt_moves where id = new.id) then
    new.pending_since := now();
    new.auto_confirmed := false;
    new.reminders := 0;
    return new;
  end if;
  if tg_op = 'INSERT' then
    return new; -- " insert ... on conflict do update " : la partie UPDATE decide
  end if;
  new.auto_confirmed := old.auto_confirmed;
  if new.pending and (new.amount, new.kind, new.currency) is distinct from (old.amount, old.kind, old.currency) then
    new.pending_since := now(); -- un autre montant : l'autre a de nouveau 7 jours
    new.reminders := 0;
  else
    new.pending_since := old.pending_since;
    new.reminders := old.reminders;
  end if;
  return new;
end $$;
drop trigger if exists debt_moves_wait on public.debt_moves;
create trigger debt_moves_wait before insert or update on public.debt_moves
  for each row execute function public.guard_debt_move_wait();

-- La notification " X a confirme " ne part pas pour une confirmation tacite (debt_moves_follow_up previent lui-meme)
create or replace function public.push_on_debt_move() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.debt_shares;
  other uuid;
  what text;
begin
  select * into s from debt_shares where id = new.share_id;
  if s.id is null or s.status <> 'active' then
    return null; -- pas encore acceptee : rien a prevenir
  end if;
  what := case new.kind when 'more' then U&'un pr\00EAt' when 'repay' then 'un remboursement' else U&'des int\00E9r\00EAts' end
          || ' de ' || push_money(new.amount, new.currency);
  if tg_op = 'INSERT' and new.deleted_at is null then
    other := case when new.recorded_by = s.owner_id then s.guest_id else s.owner_id end;
    perform push_notify(other, U&'Dettes et pr\00EAts', push_debt_other_name(s, other) || U&' a not\00E9 ' || what || U&' : \00E0 confirmer.', 'debt-' || s.id);
  elsif tg_op = 'UPDATE' then
    -- (accepter le lien confirme d'un coup ce qui etait note : la notification " a accepte " suffit)
    if old.pending and not new.pending and new.deleted_at is null and not new.auto_confirmed and s.updated_at <> now() then
      perform push_notify(new.recorded_by, U&'Dettes et pr\00EAts', push_debt_other_name(s, new.recorded_by) || U&' a confirm\00E9 ' || what || '.', 'debt-' || s.id);
    elsif new.delete_requested_by is not null and old.delete_requested_by is null then
      other := case when new.delete_requested_by = s.owner_id then s.guest_id else s.owner_id end;
      perform push_notify(other, U&'Dettes et pr\00EAts', push_debt_other_name(s, other) || ' veut supprimer ' || what || '.', 'debt-' || s.id);
    end if;
  end if;
  return null;
end $$;

-- Toutes les heures en journee (push_cron.sql, etape 8) : relances a 1 et 3 jours, confirmation a 7 jours
create or replace function public.debt_moves_follow_up() returns integer
language plpgsql security definer set search_path = public as $$
declare
  m record;
  other uuid;
  what text;
  left_days integer;
  done integer := 0;
begin
  for m in
    select dm.id, dm.kind, dm.amount, dm.currency, dm.recorded_by, dm.pending_since, dm.reminders, s as share
      from debt_moves dm
      join debt_shares s on s.id = dm.share_id
     where dm.pending and dm.deleted_at is null
       and s.status = 'active' and s.guest_id is not null
       and s.owner_left_at is null and s.guest_left_at is null and s.deleted_at is null
       and dm.pending_since < now() - interval '1 day'
     order by dm.pending_since
  loop
    other := case when m.recorded_by = (m.share).owner_id then (m.share).guest_id else (m.share).owner_id end;
    what := case m.kind when 'more' then U&'un pr\00EAt' when 'repay' then 'un remboursement' else U&'des int\00E9r\00EAts' end
            || ' de ' || push_money(m.amount, m.currency);
    if m.pending_since <= now() - interval '7 days' then
      update debt_moves set pending = false, auto_confirmed = true where id = m.id;
      perform push_notify(m.recorded_by, U&'Dettes et pr\00EAts',
        U&'Confirm\00E9 sans r\00E9ponse : ' || what || ' (' || push_debt_other_name(m.share, m.recorded_by) || U&' n''a pas r\00E9pondu en 7 jours).',
        'debt-' || (m.share).id);
      perform push_notify(other, U&'Dettes et pr\00EAts',
        upper(left(what, 1)) || substr(what, 2) || U&' not\00E9 par ' || push_debt_other_name(m.share, other) || U&' est confirm\00E9 : pas de r\00E9ponse en 7 jours.',
        'debt-' || (m.share).id);
    elsif m.reminders < 1 or (m.reminders < 2 and m.pending_since <= now() - interval '3 days') then
      left_days := greatest(1, 7 - floor(extract(epoch from now() - m.pending_since) / 86400)::integer);
      update debt_moves set reminders = case when m.pending_since <= now() - interval '3 days' then 2 else 1 end where id = m.id;
      perform push_notify(other, U&'Dettes et pr\00EAts',
        push_debt_other_name(m.share, other) || U&' attend ta r\00E9ponse pour ' || what
          || U&'. Sans r\00E9ponse, il sera confirm\00E9 dans ' || left_days || ' jour' || case when left_days > 1 then 's' else '' end || '.',
        'debt-' || (m.share).id);
    else
      continue;
    end if;
    done := done + 1;
  end loop;
  return done;
end $$;
revoke execute on function public.debt_moves_follow_up() from public, anon, authenticated;
