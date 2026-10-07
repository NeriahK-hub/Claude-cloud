-- Wallo : dettes et prêts partagés entre deux comptes
-- À exécuter dans Supabase › SQL Editor après 20261006000000_ristourne_custom_invites.sql.
--
-- Principe
-- • Une dette partagée (debt_shares) relie deux personnes : celle qui la partage (owner) et
--   celle qui accepte le lien https://…/d/CODE (guest). Elle a son propre carnet de mouvements
--   (debt_moves : prêts et remboursements), commun aux deux. Les portefeuilles restent à chacun :
--   noter un mouvement dans un portefeuille est un choix de chacun, de son côté.
-- • Chaque mouvement noté par l'un est « à confirmer » (pending) par l'autre. Accepter le lien
--   confirme les mouvements déjà notés ; « Je ne suis pas d'accord » refuse le partage (declined).
-- • Supprimer ne touche jamais l'autre : on arrête de suivre la dette (owner_left_at / guest_left_at),
--   elle reste chez l'autre avec tout l'historique.
-- • Un mouvement en attente peut être retiré par l'un ou l'autre (annuler / refuser). Un mouvement
--   confirmé ne disparaît que si l'un le demande (delete_requested_by) et que l'autre accepte.
--   Tant que l'autre ne suit pas la dette (lien pas accepté, refusé, ou quitté), on corrige librement.
-- • Garde-fous silencieux : une modification interdite est ignorée (la ligne reste comme avant et
--   revient à la prochaine synchro), pour ne jamais bloquer la synchro d'un téléphone resté hors ligne.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.debt_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_side text not null check (owner_side in ('receivable', 'payable')), -- côté de l'owner : receivable = on lui doit
  owner_label text not null check (char_length(owner_label) between 1 and 80), -- nom de l'autre chez l'owner
  guest_id uuid references auth.users (id) on delete set null,
  guest_label text check (char_length(guest_label) <= 80), -- nom de l'owner chez le guest
  status text not null default 'open' check (status in ('open', 'active', 'declined')),
  owner_left_at timestamptz,
  guest_left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index debt_shares_by_owner on public.debt_shares (owner_id);
create index debt_shares_by_guest on public.debt_shares (guest_id);

create table public.debt_moves (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.debt_shares (id) on delete cascade,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null check (kind in ('more', 'repay')), -- more : la dette grandit (prêt) ; repay : remboursement
  amount numeric not null check (amount > 0),
  currency text not null,
  occurred_at timestamptz not null default now(),
  note text check (char_length(note) <= 200),
  pending boolean not null default true, -- à confirmer par l'autre
  delete_requested_by uuid references auth.users (id) on delete set null,
  owner_tx_id text, -- opération liée dans un portefeuille de l'owner (facultatif)
  guest_tx_id text, -- … et du guest
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index debt_moves_by_share on public.debt_moves (share_id);

-- Invitations par lien (lisibles seulement par les fonctions)
create table public.debt_invites (
  code text primary key,
  share_id uuid not null references public.debt_shares (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index debt_invites_by_share on public.debt_invites (share_id);

create trigger debt_shares_touch before insert or update on public.debt_shares for each row execute function public.touch_updated_at();
create trigger debt_moves_touch before insert or update on public.debt_moves for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Qui voit quoi
-- ---------------------------------------------------------------------------

-- Je suis l'une des deux personnes et je suis encore la dette
create or replace function public.is_debt_party(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from debt_shares
     where id = s and deleted_at is null
       and ((owner_id = auth.uid() and owner_left_at is null)
         or (guest_id = auth.uid() and status = 'active' and guest_left_at is null))
  );
$$;

-- Les deux suivent la dette : les règles de confirmation s'appliquent
create or replace function public.debt_share_live(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from debt_shares
     where id = s and status = 'active' and guest_id is not null
       and owner_left_at is null and guest_left_at is null and deleted_at is null
  );
$$;

alter table public.debt_shares enable row level security;
alter table public.debt_moves enable row level security;
alter table public.debt_invites enable row level security;
revoke all on table public.debt_invites from anon, authenticated;
revoke all on table public.debt_shares, public.debt_moves from anon;
grant select, insert, update on public.debt_shares, public.debt_moves to authenticated;

-- Écrit sur la ligne elle-même (pas via is_debt_party) : « insert … on conflict » vérifie
-- aussi cette règle sur la nouvelle ligne, qui n'est pas encore dans la table
create policy "dettes partagées : les miennes" on public.debt_shares for select
  using ((owner_id = auth.uid() and owner_left_at is null)
      or (guest_id = auth.uid() and status = 'active' and guest_left_at is null));
create policy "dettes partagées : créer" on public.debt_shares for insert
  with check (owner_id = auth.uid() and guest_id is null and status = 'open');
create policy "dettes partagées : l'owner renomme" on public.debt_shares for update
  using (owner_id = auth.uid() and owner_left_at is null) with check (owner_id = auth.uid());

create policy "mouvements : voir" on public.debt_moves for select
  using (public.is_debt_party(share_id));
create policy "mouvements : noter" on public.debt_moves for insert
  with check (public.is_debt_party(share_id) and recorded_by = auth.uid());
create policy "mouvements : corriger" on public.debt_moves for update
  using (public.is_debt_party(share_id)) with check (public.is_debt_party(share_id));

-- ---------------------------------------------------------------------------
-- Garde-fous (seulement pour les requêtes de l'app : les fonctions ci-dessous passent)
-- ---------------------------------------------------------------------------

-- L'owner ne change que le nom de l'autre, et son côté tant que personne n'a accepté
create or replace function public.guard_debt_share() returns trigger
language plpgsql as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  new.owner_id := old.owner_id;
  new.guest_id := old.guest_id;
  new.guest_label := old.guest_label;
  new.status := old.status;
  new.owner_left_at := old.owner_left_at;
  new.guest_left_at := old.guest_left_at;
  new.deleted_at := old.deleted_at;
  new.created_at := old.created_at;
  if old.status <> 'open' then
    new.owner_side := old.owner_side;
  end if;
  return new;
end $$;
create trigger debt_shares_guard before update on public.debt_shares for each row execute function public.guard_debt_share();

-- Pas « security definer » : current_user doit rester celui de la requête (authenticated pour l'app)
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
    if i_am_owner then new.guest_tx_id := null; else new.owner_tx_id := null; end if;
    return new;
  end if;

  -- Ce qui ne change jamais
  new.share_id := old.share_id;
  new.recorded_by := old.recorded_by;
  -- Chacun ne relie que ses propres opérations
  if i_am_owner then new.guest_tx_id := old.guest_tx_id; else new.owner_tx_id := old.owner_tx_id; end if;

  if not live then
    -- Seul à suivre la dette : c'est un simple carnet, on corrige librement
    -- (mais on ne ressuscite pas un mouvement supprimé)
    if old.deleted_at is not null then
      new.deleted_at := old.deleted_at;
    end if;
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

  -- Confirmer : seulement l'autre, et on ne « dé-confirme » jamais
  if new.pending is distinct from old.pending
     and not (old.pending and not new.pending and me is distinct from old.recorded_by) then
    new.pending := old.pending;
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
create trigger debt_moves_guard before insert or update on public.debt_moves for each row execute function public.guard_debt_move();

-- ---------------------------------------------------------------------------
-- Invitation par lien
-- ---------------------------------------------------------------------------

-- Créer (ou reprendre) le code d'une dette : l'owner seulement. Après un refus ou un départ
-- de l'autre, un nouveau lien remet la dette en attente d'une personne.
create or replace function public.create_debt_invite(s uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  sh debt_shares;
  inv debt_invites;
  c text;
begin
  select * into sh from debt_shares where id = s and owner_id = auth.uid() and owner_left_at is null and deleted_at is null;
  if sh.id is null then
    raise exception 'Seul le propriétaire de la dette peut inviter';
  end if;
  if public.debt_share_live(s) then
    raise exception 'Cette dette est déjà partagée';
  end if;
  if sh.status <> 'open' or sh.guest_id is not null then
    update debt_shares set status = 'open', guest_id = null, guest_label = null, guest_left_at = null where id = s;
  end if;
  select * into inv from debt_invites
   where share_id = s and not revoked and expires_at > now() + interval '1 day'
   order by expires_at desc limit 1;
  if inv.code is null then
    loop
      c := '';
      for i in 1..8 loop
        c := c || substr(alphabet, 1 + get_byte(uuid_send(gen_random_uuid()), 0) % length(alphabet), 1);
      end loop;
      -- Un code ne doit pas exister aussi pour un portefeuille ou une ristourne
      if exists (select 1 from wallet_invites where code = c) or exists (select 1 from ristourne_invites where code = c) then
        continue;
      end if;
      begin
        insert into debt_invites (code, share_id, created_by) values (c, s, auth.uid()) returning * into inv;
        exit;
      exception when unique_violation then
        -- code déjà pris : on en tire un autre
      end;
    end loop;
  end if;
  return jsonb_build_object('code', inv.code, 'expires_at', inv.expires_at);
end $$;

create or replace function public.revoke_debt_invites(s uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from debt_shares where id = s and owner_id = auth.uid()) then
    raise exception 'Seul le propriétaire de la dette peut annuler une invitation';
  end if;
  update debt_invites set revoked = true where share_id = s and not revoked;
end $$;

-- Ce que dit un code avant d'accepter. status : ok, owner, already, taken, expired, invalid, blocked.
-- guest_side : le côté de la personne invitée (receivable = on lui doit).
create or replace function public.debt_invite_check(invite_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv debt_invites;
  sh debt_shares;
  st text;
begin
  if me is null then
    raise exception 'Connexion requise';
  end if;
  if (select count(*) from wallet_invite_attempts where user_id = me and at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('status', 'blocked');
  end if;
  select * into inv from debt_invites where code = c;
  if inv.code is not null then
    select * into sh from debt_shares where id = inv.share_id and deleted_at is null;
  end if;
  if sh.id is null then
    insert into wallet_invite_attempts (user_id) values (me);
    return jsonb_build_object('status', 'invalid');
  end if;
  if inv.revoked or inv.expires_at <= now() or sh.owner_left_at is not null then
    return jsonb_build_object('status', 'expired');
  end if;
  st := case
    when sh.owner_id = me then 'owner'
    when sh.guest_id = me and sh.status = 'active' and sh.guest_left_at is null then 'already'
    when sh.guest_id is not null and sh.status = 'active' and sh.guest_left_at is null then 'taken'
    else 'ok'
  end;
  return jsonb_build_object(
    'status', st,
    'code', c,
    'share_id', sh.id,
    'owner_name', person_name(sh.owner_id),
    'guest_side', case sh.owner_side when 'receivable' then 'payable' else 'receivable' end,
    'moves', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount, 'currency', currency, 'occurred_at', occurred_at, 'note', note) order by occurred_at)
        from debt_moves where share_id = sh.id and deleted_at is null
    ), '[]'::jsonb)
  );
end $$;

-- Accepter : je deviens l'autre personne de la dette, et ce qui est déjà noté est confirmé.
-- label : le nom de l'owner chez moi.
create or replace function public.join_debt(invite_code text, label text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  info jsonb := debt_invite_check(invite_code);
  sid uuid;
begin
  if info ->> 'status' <> 'ok' then
    return info;
  end if;
  sid := (info ->> 'share_id')::uuid;
  update debt_shares
     set guest_id = me, status = 'active', guest_left_at = null,
         guest_label = left(coalesce(nullif(trim(label), ''), info ->> 'owner_name'), 80)
   where id = sid;
  update debt_moves set pending = false, delete_requested_by = null where share_id = sid and deleted_at is null;
  update debt_invites set revoked = true where share_id = sid and not revoked;
  return info || jsonb_build_object('status', 'joined');
end $$;

-- « Je ne suis pas d'accord » : l'owner le voit, et peut corriger puis renvoyer un lien
create or replace function public.decline_debt(invite_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  info jsonb := debt_invite_check(invite_code);
  sid uuid;
begin
  if info ->> 'status' <> 'ok' then
    return info;
  end if;
  sid := (info ->> 'share_id')::uuid;
  update debt_shares set guest_id = me, status = 'declined', guest_label = null, guest_left_at = null where id = sid;
  update debt_invites set revoked = true where share_id = sid and not revoked;
  return info || jsonb_build_object('status', 'declined');
end $$;

-- Arrêter de suivre une dette (« supprimer » chez moi) : elle reste chez l'autre
create or replace function public.leave_debt_share(s uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update debt_shares set owner_left_at = coalesce(owner_left_at, now()) where id = s and owner_id = auth.uid();
  if found then
    update debt_invites set revoked = true where share_id = s and not revoked;
    return;
  end if;
  update debt_shares set guest_left_at = coalesce(guest_left_at, now()) where id = s and guest_id = auth.uid();
end $$;

revoke all on function public.is_debt_party(uuid), public.debt_share_live(uuid), public.create_debt_invite(uuid),
  public.revoke_debt_invites(uuid), public.debt_invite_check(text), public.join_debt(text, text),
  public.decline_debt(text), public.leave_debt_share(uuid) from public, anon;
grant execute on function public.is_debt_party(uuid), public.debt_share_live(uuid), public.create_debt_invite(uuid),
  public.revoke_debt_invites(uuid), public.debt_invite_check(text), public.join_debt(text, text),
  public.decline_debt(text), public.leave_debt_share(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Temps réel : un mouvement noté par l'autre arrive tout de suite
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.debt_shares, public.debt_moves;
  end if;
end $$;
