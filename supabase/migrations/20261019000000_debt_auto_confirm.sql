-- Wallo : dettes partagées — rappels et confirmation tacite après 7 jours
-- À exécuter dans Supabase › SQL Editor après 20261018000000_scale.sql, puis l'étape 8 de supabase/push_cron.sql.
--
-- Principe
-- • Un mouvement noté par l'un attend la confirmation de l'autre (pending). Si l'autre n'ouvre
--   pas l'app, il est relancé : une notification après 1 jour, une autre après 3 jours.
-- • Après 7 jours sans réponse (ni confirmé, ni refusé), le mouvement est confirmé tout seul
--   (auto_confirmed). Les deux sont prévenus. Ensuite, comme tout mouvement confirmé, il ne
--   disparaît que si les deux sont d'accord.
-- • Le délai part de l'enregistrement (pending_since), pas de la date choisie pour le mouvement ;
--   il repart de zéro si celui qui l'a noté change le montant, le sens ou la devise.

alter table public.debt_moves add column if not exists pending_since timestamptz not null default now();
alter table public.debt_moves add column if not exists auto_confirmed boolean not null default false;
alter table public.debt_moves add column if not exists reminders smallint not null default 0; -- relances déjà envoyées

-- Ce qui attend déjà : 7 jours pleins à partir d'aujourd'hui (et la date arrive sur les téléphones à la synchro)
update public.debt_moves set pending_since = now() where pending and deleted_at is null;

-- Ces trois colonnes ne bougent que par le serveur (passe après debt_moves_guard : ordre alphabétique)
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
    return new; -- « insert … on conflict do update » : la partie UPDATE décide
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

-- La notification « X a confirmé » ne part pas pour une confirmation tacite (debt_moves_follow_up prévient lui-même)
create or replace function public.push_on_debt_move() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.debt_shares;
  other uuid;
  what text;
begin
  select * into s from debt_shares where id = new.share_id;
  if s.id is null or s.status <> 'active' then
    return null; -- pas encore acceptée : rien à prévenir
  end if;
  what := case new.kind when 'more' then 'un prêt' when 'repay' then 'un remboursement' else 'des intérêts' end
          || ' de ' || push_money(new.amount, new.currency);
  if tg_op = 'INSERT' and new.deleted_at is null then
    other := case when new.recorded_by = s.owner_id then s.guest_id else s.owner_id end;
    perform push_notify(other, 'Dettes et prêts', push_debt_other_name(s, other) || ' a noté ' || what || ' : à confirmer.', 'debt-' || s.id);
  elsif tg_op = 'UPDATE' then
    -- (accepter le lien confirme d'un coup ce qui était noté : la notification « a accepté » suffit)
    if old.pending and not new.pending and new.deleted_at is null and not new.auto_confirmed and s.updated_at <> now() then
      perform push_notify(new.recorded_by, 'Dettes et prêts', push_debt_other_name(s, new.recorded_by) || ' a confirmé ' || what || '.', 'debt-' || s.id);
    elsif new.delete_requested_by is not null and old.delete_requested_by is null then
      other := case when new.delete_requested_by = s.owner_id then s.guest_id else s.owner_id end;
      perform push_notify(other, 'Dettes et prêts', push_debt_other_name(s, other) || ' veut supprimer ' || what || '.', 'debt-' || s.id);
    end if;
  end if;
  return null;
end $$;

-- Toutes les heures en journée (push_cron.sql, étape 8) : relances à 1 et 3 jours, confirmation à 7 jours
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
    what := case m.kind when 'more' then 'un prêt' when 'repay' then 'un remboursement' else 'des intérêts' end
            || ' de ' || push_money(m.amount, m.currency);
    if m.pending_since <= now() - interval '7 days' then
      update debt_moves set pending = false, auto_confirmed = true where id = m.id;
      perform push_notify(m.recorded_by, 'Dettes et prêts',
        'Confirmé sans réponse : ' || what || ' (' || push_debt_other_name(m.share, m.recorded_by) || ' n''a pas répondu en 7 jours).',
        'debt-' || (m.share).id);
      perform push_notify(other, 'Dettes et prêts',
        upper(left(what, 1)) || substr(what, 2) || ' noté par ' || push_debt_other_name(m.share, other) || ' est confirmé : pas de réponse en 7 jours.',
        'debt-' || (m.share).id);
    elsif m.reminders < 1 or (m.reminders < 2 and m.pending_since <= now() - interval '3 days') then
      left_days := greatest(1, 7 - floor(extract(epoch from now() - m.pending_since) / 86400)::integer);
      update debt_moves set reminders = case when m.pending_since <= now() - interval '3 days' then 2 else 1 end where id = m.id;
      perform push_notify(other, 'Dettes et prêts',
        push_debt_other_name(m.share, other) || ' attend ta réponse pour ' || what
          || '. Sans réponse, il sera confirmé dans ' || left_days || ' jour' || case when left_days > 1 then 's' else '' end || '.',
        'debt-' || (m.share).id);
    else
      continue;
    end if;
    done := done + 1;
  end loop;
  return done;
end $$;
revoke execute on function public.debt_moves_follow_up() from public, anon, authenticated;
