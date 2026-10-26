-- Wallo : dettes partagées — refuser un mouvement sans l'effacer
-- À exécuter dans Supabase › SQL Editor après 20261028000000_debt_auto_confirm.sql.
--
-- Principe
-- • Avant, « Refuser » supprimait le mouvement noté par l'autre. Maintenant il reste, marqué refusé
--   (refused_at) : il ne compte pas, n'est ni relancé ni confirmé tout seul, et celui qui l'a noté est
--   prévenu. Il choisit : le corriger (nouvelle demande), le renvoyer tel quel (resend_debt_move),
--   ou le retirer.
-- • Seul l'autre refuse, et seulement un mouvement en attente. Celui qui refuse peut encore le
--   confirmer ensuite (il a changé d'avis) : le refus s'efface.

alter table public.debt_moves add column if not exists refused_at timestamptz;

-- Colonnes tenues par le serveur (même fonction que …_debt_auto_confirm.sql, avec le refus)
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
    return new; -- « insert … on conflict do update » : la partie UPDATE décide
  end if;
  new.auto_confirmed := old.auto_confirmed;

  -- Refus : par l'autre, sur un mouvement en attente d'une dette suivie à deux
  if new.pending and old.pending and old.refused_at is null and new.refused_at is not null
     and auth.uid() is distinct from old.recorded_by and public.debt_share_live(old.share_id) then
    new.refused_at := now();
  elsif not new.pending then
    new.refused_at := null; -- confirmé (celui qui avait refusé a changé d'avis)
  elsif old.refused_at is not null and auth.uid() = old.recorded_by
     and (new.kind, new.amount, new.currency, new.occurred_at, new.note)
         is distinct from (old.kind, old.amount, old.currency, old.occurred_at, old.note) then
    new.refused_at := null; -- corrigé par celui qui l'a noté : c'est une nouvelle demande
  else
    new.refused_at := old.refused_at;
  end if;
  resent := old.refused_at is not null and new.refused_at is null and new.pending;

  if new.pending and ((new.amount, new.kind, new.currency) is distinct from (old.amount, old.kind, old.currency) or resent) then
    new.pending_since := now(); -- un autre montant (ou une demande corrigée) : l'autre a de nouveau 7 jours
    new.reminders := 0;
  else
    new.pending_since := old.pending_since;
    new.reminders := old.reminders;
  end if;
  return new;
end $$;

-- Renvoyer tel quel un mouvement refusé : celui qui l'a noté
create or replace function public.resend_debt_move(p_move uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m debt_moves;
  s debt_shares;
  other uuid;
begin
  select * into m from debt_moves where id = p_move and deleted_at is null;
  if m.id is null or m.recorded_by is distinct from auth.uid() then
    raise exception 'Seul celui qui a noté ce mouvement peut le renvoyer';
  end if;
  if not m.pending or m.refused_at is null or not public.debt_share_live(m.share_id) then
    raise exception 'Ce mouvement n''est pas refusé';
  end if;
  update debt_moves set refused_at = null, pending_since = now(), reminders = 0 where id = m.id;
  select * into s from debt_shares where id = m.share_id;
  other := case when m.recorded_by = s.owner_id then s.guest_id else s.owner_id end;
  perform push_notify(other, 'Dettes et prêts',
    push_debt_other_name(s, other) || ' te redemande de confirmer '
      || case m.kind when 'more' then 'un prêt' when 'repay' then 'un remboursement' else 'des intérêts' end
      || ' de ' || push_money(m.amount, m.currency) || '.',
    'debt-' || s.id);
end $$;
revoke execute on function public.resend_debt_move(uuid) from public, anon;
grant execute on function public.resend_debt_move(uuid) to authenticated;

-- Notifications : en plus, « X n'a pas reconnu … » à celui qui l'a noté
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
    elsif old.refused_at is null and new.refused_at is not null and new.deleted_at is null then
      perform push_notify(new.recorded_by, 'Dettes et prêts',
        push_debt_other_name(s, new.recorded_by) || ' n''a pas reconnu ' || what || '. Corrige-le, renvoie-le ou retire-le.', 'debt-' || s.id);
    elsif new.delete_requested_by is not null and old.delete_requested_by is null then
      other := case when new.delete_requested_by = s.owner_id then s.guest_id else s.owner_id end;
      perform push_notify(other, 'Dettes et prêts', push_debt_other_name(s, other) || ' veut supprimer ' || what || '.', 'debt-' || s.id);
    end if;
  end if;
  return null;
end $$;

-- Relances et confirmation tacite : pas pour un mouvement refusé (même fonction, avec refused_at is null)
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
