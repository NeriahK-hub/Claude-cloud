-- Wallo : dettes partagees - refuser un mouvement sans l'effacer
-- A executer dans Supabase > SQL Editor apres 20261028000000_debt_auto_confirm.sql.
--
-- Principe
-- * Avant, " Refuser " supprimait le mouvement note par l'autre. Maintenant il reste, marque refuse
--   (refused_at) : il ne compte pas, n'est ni relance ni confirme tout seul, et celui qui l'a note est
--   prevenu. Il choisit : le corriger (nouvelle demande), le renvoyer tel quel (resend_debt_move),
--   ou le retirer.
-- * Seul l'autre refuse, et seulement un mouvement en attente. Celui qui refuse peut encore le
--   confirmer ensuite (il a change d'avis) : le refus s'efface.

alter table public.debt_moves add column if not exists refused_at timestamptz;

-- Colonnes tenues par le serveur (meme fonction que ..._debt_auto_confirm.sql, avec le refus)
create or replace function public.guard_debt_move_wait() returns trigger
language plpgsql set search_path = public as $$
declare
  resent boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from debt_moves where id = new.id) then
    new.pending_since := now();
    new.auto_confirmed := false;
    new.reminders := 0;
    new.refused_at := null;
    return new;
  end if;
  if tg_op = 'INSERT' then
    return new; -- " insert ... on conflict do update " : la partie UPDATE decide
  end if;
  new.auto_confirmed := old.auto_confirmed;

  -- Refus : par l'autre, sur un mouvement en attente d'une dette suivie a deux
  if new.pending and old.pending and old.refused_at is null and new.refused_at is not null
     and auth.uid() is distinct from old.recorded_by and public.debt_share_live(old.share_id) then
    new.refused_at := now();
  elsif not new.pending then
    new.refused_at := null; -- confirme (celui qui avait refuse a change d'avis)
  elsif old.refused_at is not null and auth.uid() = old.recorded_by
     and (new.kind, new.amount, new.currency, new.occurred_at, new.note)
         is distinct from (old.kind, old.amount, old.currency, old.occurred_at, old.note) then
    new.refused_at := null; -- corrige par celui qui l'a note : c'est une nouvelle demande
  else
    new.refused_at := old.refused_at;
  end if;
  resent := old.refused_at is not null and new.refused_at is null and new.pending;

  if new.pending and ((new.amount, new.kind, new.currency) is distinct from (old.amount, old.kind, old.currency) or resent) then
    new.pending_since := now(); -- un autre montant (ou une demande corrigee) : l'autre a de nouveau 7 jours
    new.reminders := 0;
  else
    new.pending_since := old.pending_since;
    new.reminders := old.reminders;
  end if;
  return new;
end $$;

-- Renvoyer tel quel un mouvement refuse : celui qui l'a note
create or replace function public.resend_debt_move(p_move uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m debt_moves;
  s debt_shares;
  other uuid;
begin
  select * into m from debt_moves where id = p_move and deleted_at is null;
  if m.id is null or m.recorded_by is distinct from auth.uid() then
    raise exception '%', U&'Seul celui qui a not\00E9 ce mouvement peut le renvoyer';
  end if;
  if not m.pending or m.refused_at is null or not public.debt_share_live(m.share_id) then
    raise exception '%', U&'Ce mouvement n''est pas refus\00E9';
  end if;
  update debt_moves set refused_at = null, pending_since = now(), reminders = 0 where id = m.id;
  select * into s from debt_shares where id = m.share_id;
  other := case when m.recorded_by = s.owner_id then s.guest_id else s.owner_id end;
  perform push_notify(other, U&'Dettes et pr\00EAts',
    push_debt_other_name(s, other) || ' te redemande de confirmer '
      || case m.kind when 'more' then U&'un pr\00EAt' when 'repay' then 'un remboursement' else U&'des int\00E9r\00EAts' end
      || ' de ' || push_money(m.amount, m.currency) || '.',
    'debt-' || s.id);
end $$;
revoke execute on function public.resend_debt_move(uuid) from public, anon;
grant execute on function public.resend_debt_move(uuid) to authenticated;

-- Notifications : en plus, " X n'a pas reconnu ... " a celui qui l'a note
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
    elsif old.refused_at is null and new.refused_at is not null and new.deleted_at is null then
      perform push_notify(new.recorded_by, U&'Dettes et pr\00EAts',
        push_debt_other_name(s, new.recorded_by) || ' n''a pas reconnu ' || what || '. Corrige-le, renvoie-le ou retire-le.', 'debt-' || s.id);
    elsif new.delete_requested_by is not null and old.delete_requested_by is null then
      other := case when new.delete_requested_by = s.owner_id then s.guest_id else s.owner_id end;
      perform push_notify(other, U&'Dettes et pr\00EAts', push_debt_other_name(s, other) || ' veut supprimer ' || what || '.', 'debt-' || s.id);
    end if;
  end if;
  return null;
end $$;

-- Relances et confirmation tacite : pas pour un mouvement refuse (meme fonction, avec refused_at is null)
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
     where dm.pending and dm.deleted_at is null and dm.refused_at is null
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
