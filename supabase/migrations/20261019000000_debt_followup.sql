-- Wallo : dettes partagées — quand l'autre ne répond pas (ou refuse)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261007000000_shared_debts.sql et 20261009000000_push.sql). La tâche du matin est dans supabase/push_cron.sql (étape 8).
--
-- • Un mouvement à confirmer : rappel à l'autre 2 jours puis 7 jours après, prévenu à 12 jours,
--   et confirmé tout seul à 14 jours sans réponse (l'autre peut ensuite demander à le retirer).
-- • Celui qui l'a noté peut relancer (une fois par jour) : notification à l'autre.
-- • Refuser ne supprime plus : le mouvement reste « refusé » chez celui qui l'a noté, qui est prévenu
--   et choisit : corriger et renvoyer, ou le retirer (avec son opération dans le portefeuille).

alter table public.debt_moves
  add column if not exists asked_at timestamptz not null default now(), -- depuis quand on attend la réponse
  add column if not exists refused_at timestamptz, -- refusé par l'autre (reste à confirmer, ne compte pas)
  add column if not exists nudged_at timestamptz, -- dernière relance
  add column if not exists auto_confirmed boolean not null default false; -- confirmé faute de réponse

-- Délai avant la confirmation automatique (en jours)
create or replace function public.debt_auto_confirm_days() returns integer
language sql immutable as $$ select 14 $$;

-- ---------------------------------------------------------------------------
-- Règles (même fonction que 20261007000000_shared_debts.sql, avec les nouvelles colonnes)
-- ---------------------------------------------------------------------------

create or replace function public.guard_debt_move() returns trigger
language plpgsql set search_path = public as $$
declare
  me uuid := auth.uid();
  sh debt_shares;
  live boolean;
  i_am_owner boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  select * into sh from debt_shares where id = coalesce(old.share_id, new.share_id);
  live := public.debt_share_live(sh.id);
  i_am_owner := sh.owner_id = me;

  if tg_op = 'INSERT' then
    -- La synchro envoie « insert … on conflict do update » : pour une ligne qui existe déjà,
    -- c'est la partie UPDATE ci-dessous qui décide (sinon une confirmation serait perdue)
    if exists (select 1 from debt_moves where id = new.id) then
      return new;
    end if;
    new.recorded_by := me;
    new.pending := true; -- l'autre confirme (accepter le lien confirme ce qui est déjà noté)
    new.delete_requested_by := null;
    new.deleted_at := null;
    new.asked_at := now();
    new.refused_at := null;
    new.nudged_at := null;
    new.auto_confirmed := false;
    if i_am_owner then new.guest_tx_id := null; else new.owner_tx_id := null; end if;
    return new;
  end if;

  -- Ce qui ne change jamais (ou seulement par les fonctions de la base)
  new.share_id := old.share_id;
  new.recorded_by := old.recorded_by;
  new.asked_at := old.asked_at;
  new.nudged_at := old.nudged_at;
  new.auto_confirmed := old.auto_confirmed;
  -- Chacun ne relie que ses propres opérations
  if i_am_owner then new.guest_tx_id := old.guest_tx_id; else new.owner_tx_id := old.owner_tx_id; end if;

  if not live then
    -- Seul à suivre la dette : c'est un simple carnet, on corrige librement
    -- (mais on ne ressuscite pas un mouvement supprimé)
    if old.deleted_at is not null then
      new.deleted_at := old.deleted_at;
    end if;
    new.refused_at := old.refused_at;
    return new;
  end if;

  -- Confirmé : montant, sens, devise, date et note ne bougent plus
  if not old.pending then
    new.kind := old.kind;
    new.amount := old.amount;
    new.currency := old.currency;
    new.occurred_at := old.occurred_at;
    new.note := old.note;
  end if;

  -- Refuser : seulement l'autre, sur un mouvement en attente. On n'efface pas un refus
  -- (sauf en corrigeant le mouvement, ou avec « Renvoyer » : nudge_debt_move)
  if old.refused_at is null and new.refused_at is not null and old.pending and me is distinct from old.recorded_by then
    new.refused_at := now();
  else
    new.refused_at := old.refused_at;
  end if;

  -- Corrigé par celui qui l'a noté pendant l'attente : c'est une nouvelle demande
  if old.pending and me = old.recorded_by
     and (new.kind, new.amount, new.currency, new.occurred_at, new.note)
         is distinct from (old.kind, old.amount, old.currency, old.occurred_at, old.note) then
    new.refused_at := null;
    new.asked_at := now();
  end if;

  -- Confirmer : seulement l'autre, et on ne « dé-confirme » jamais
  if new.pending is distinct from old.pending
     and not (old.pending and not new.pending and me is distinct from old.recorded_by) then
    new.pending := old.pending;
  end if;
  if not new.pending then
    new.refused_at := null; -- l'autre a changé d'avis : confirmé
  end if;

  -- Demande de suppression : on la fait pour soi, ou on l'enlève (annuler / refuser)
  if new.delete_requested_by is not null and new.delete_requested_by is distinct from old.delete_requested_by
     and new.delete_requested_by <> me then
    new.delete_requested_by := old.delete_requested_by;
  end if;

  -- Suppression : en attente (annuler ou refuser), ou demandée par l'autre (accepter)
  if new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is not null
       or not (old.pending or (old.delete_requested_by is not null and old.delete_requested_by <> me)) then
      new.deleted_at := old.deleted_at;
    end if;
  end if;
  return new;
end $$;

-- Libellé d'un mouvement dans une notification (« un remboursement de 20,00 $ »)
create or replace function public.push_debt_move_label(m public.debt_moves) returns text
language sql stable set search_path = public as $$
  select case m.kind when 'more' then 'un prêt' when 'repay' then 'un remboursement' else 'des intérêts' end
         || ' de ' || push_money(m.amount, m.currency);
$$;

-- ---------------------------------------------------------------------------
-- Relancer (ou renvoyer après un refus) : celui qui l'a noté, une fois par jour
-- ---------------------------------------------------------------------------

create or replace function public.nudge_debt_move(p_move uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m debt_moves;
  s debt_shares;
  other uuid;
  what text;
  resend boolean;
begin
  select * into m from debt_moves where id = p_move and deleted_at is null;
  if m.id is null or m.recorded_by is distinct from auth.uid() then
    raise exception 'Seul celui qui a noté ce mouvement peut relancer';
  end if;
  if not m.pending or not public.debt_share_live(m.share_id) then
    raise exception 'Ce mouvement n''attend plus de réponse';
  end if;
  resend := m.refused_at is not null;
  if not resend and m.nudged_at > now() - interval '20 hours' then
    raise exception 'Déjà relancé aujourd''hui';
  end if;
  select * into s from debt_shares where id = m.share_id;
  other := case when m.recorded_by = s.owner_id then s.guest_id else s.owner_id end;
  update debt_moves
     set nudged_at = now(),
         refused_at = null,
         asked_at = case when resend then now() else asked_at end
   where id = m.id;
  what := push_debt_move_label(m);
  perform push_notify(other, 'Dettes et prêts',
    push_debt_other_name(s, other) || case when resend then ' te redemande de confirmer ' else ' attend ta réponse : ' end || what || '.',
    'debt-' || s.id);
  return jsonb_build_object('status', case when resend then 'resent' else 'nudged' end);
end $$;
revoke execute on function public.nudge_debt_move(uuid) from public, anon;
grant execute on function public.nudge_debt_move(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------


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
  what := push_debt_move_label(new);
  if tg_op = 'INSERT' and new.deleted_at is null then
    other := case when new.recorded_by = s.owner_id then s.guest_id else s.owner_id end;
    perform push_notify(other, 'Dettes et prêts', push_debt_other_name(s, other) || ' a noté ' || what || ' : à confirmer.', 'debt-' || s.id);
  elsif tg_op = 'UPDATE' then
    -- (accepter le lien confirme d'un coup ce qui était noté : la notification « a accepté » suffit ;
    --  la confirmation automatique prévient elle-même les deux personnes)
    if old.pending and not new.pending and new.deleted_at is null and s.updated_at <> now() and not new.auto_confirmed then
      perform push_notify(new.recorded_by, 'Dettes et prêts', push_debt_other_name(s, new.recorded_by) || ' a confirmé ' || what || '.', 'debt-' || s.id);
    elsif (old.refused_at is null and new.refused_at is not null)
       or (old.pending and old.deleted_at is null and new.deleted_at is not null and auth.uid() is distinct from new.recorded_by
           and s.owner_left_at is null and s.guest_left_at is null) then
      -- Refusé (ou supprimé par l'autre avec une ancienne version de l'app)
      perform push_notify(new.recorded_by, 'Dettes et prêts',
        push_debt_other_name(s, new.recorded_by) || ' n''a pas reconnu ' || what || '. Corrige-le ou retire-le.', 'debt-' || s.id);
    elsif new.delete_requested_by is not null and old.delete_requested_by is null then
      other := case when new.delete_requested_by = s.owner_id then s.guest_id else s.owner_id end;
      perform push_notify(other, 'Dettes et prêts', push_debt_other_name(s, other) || ' veut supprimer ' || what || '.', 'debt-' || s.id);
    end if;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Chaque matin : rappels à 2 et 7 jours, avertissement à 12 jours, confirmation à 14 jours
-- ---------------------------------------------------------------------------

create or replace function public.push_debt_pending_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Africa/Kinshasa')::date;
  limit_days integer := debt_auto_confirm_days();
  m debt_moves;
  s debt_shares;
  other uuid;
  what text;
  waited integer;
  sent integer := 0;
begin
  for m in
    select dm.* from debt_moves dm
     where dm.pending and dm.deleted_at is null and dm.refused_at is null
       and public.debt_share_live(dm.share_id)
  loop
    select * into s from debt_shares where id = m.share_id;
    waited := today - (m.asked_at at time zone 'Africa/Kinshasa')::date;
    other := case when m.recorded_by = s.owner_id then s.guest_id else s.owner_id end;
    what := push_debt_move_label(m);
    if waited >= limit_days then
      update debt_moves set pending = false, auto_confirmed = true where id = m.id;
      perform push_notify(other, 'Dettes et prêts',
        'Sans réponse de ta part, ' || what || ' noté par ' || push_debt_other_name(s, other)
        || ' est confirmé. Pas d''accord ? Demande à le retirer.', 'debt-' || s.id);
      perform push_notify(m.recorded_by, 'Dettes et prêts',
        upper(left(what, 1)) || substr(what, 2) || ' est confirmé automatiquement (' || push_debt_other_name(s, m.recorded_by)
        || ' n''a pas répondu en ' || limit_days || ' jours).', 'debt-' || s.id);
    elsif waited in (2, 7, limit_days - 2) then
      perform push_notify(other, 'Dettes et prêts',
        push_debt_other_name(s, other) || ' attend ta réponse : ' || what || '.'
        || case when waited = limit_days - 2 then ' Sans réponse, il sera confirmé dans 2 jours.' else '' end,
        'debt-' || s.id);
    else
      continue;
    end if;
    sent := sent + 1;
  end loop;
  return sent;
end $$;
revoke execute on function public.push_debt_pending_reminders() from public, anon, authenticated;
