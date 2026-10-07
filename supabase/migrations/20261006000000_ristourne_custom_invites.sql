-- Wallo : ristournes — fréquence « tous les N jours » et invitation des membres par lien
-- À exécuter dans Supabase › SQL Editor après 20261005000000_promo_rpc.sql.
--
-- • Fréquence personnalisée : frequency = 'custom' + every_days (1 à 365 jours).
-- • Invitation par lien https://…/t/CODE (t comme tontine), valable 7 jours, comme pour les portefeuilles.
--   La personne qui l'ouvre peut reprendre une place déjà notée par son nom (« Je suis Kemy »),
--   sinon elle est ajoutée au tour suivant. Les codes ne sont lisibles que par les fonctions.

-- ---------------------------------------------------------------------------
-- Fréquence personnalisée
-- ---------------------------------------------------------------------------

alter table public.ristournes drop constraint if exists ristournes_frequency_check;
alter table public.ristournes add constraint ristournes_frequency_check
  check (frequency in ('weekly', 'biweekly', 'monthly', 'custom'));
alter table public.ristournes add column every_days integer check (every_days between 1 and 365);
alter table public.ristournes add constraint ristournes_custom_days
  check (frequency <> 'custom' or every_days is not null);

-- ---------------------------------------------------------------------------
-- Invitations par lien
-- ---------------------------------------------------------------------------

create table public.ristourne_invites (
  code text primary key,
  ristourne_id uuid not null references public.ristournes (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index ristourne_invites_by_ristourne on public.ristourne_invites (ristourne_id);

alter table public.ristourne_invites enable row level security;
revoke all on table public.ristourne_invites from anon, authenticated;

-- Créer (ou reprendre) le code d'une ristourne : propriétaire seulement
create or replace function public.create_ristourne_invite(r uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  inv ristourne_invites;
  c text;
begin
  if not exists (select 1 from ristournes where id = r and owner_id = auth.uid() and deleted_at is null) then
    raise exception 'Seul le propriétaire de la ristourne peut inviter';
  end if;
  select * into inv from ristourne_invites
   where ristourne_id = r and not revoked and expires_at > now() + interval '1 day'
   order by expires_at desc limit 1;
  if inv.code is null then
    loop
      c := '';
      for i in 1..8 loop
        c := c || substr(alphabet, 1 + get_byte(uuid_send(gen_random_uuid()), 0) % length(alphabet), 1);
      end loop;
      -- Un code ne doit pas exister aussi pour un portefeuille (les deux se tapent au même endroit)
      if exists (select 1 from wallet_invites where code = c) then
        continue;
      end if;
      begin
        insert into ristourne_invites (code, ristourne_id, created_by) values (c, r, auth.uid()) returning * into inv;
        exit;
      exception when unique_violation then
        -- code déjà pris : on en tire un autre
      end;
    end loop;
  end if;
  return jsonb_build_object('code', inv.code, 'expires_at', inv.expires_at);
end $$;

create or replace function public.revoke_ristourne_invites(r uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ristournes where id = r and owner_id = auth.uid()) then
    raise exception 'Seul le propriétaire de la ristourne peut annuler une invitation';
  end if;
  update ristourne_invites set revoked = true where ristourne_id = r and not revoked;
end $$;

-- Ce que dit un code avant de rejoindre. status : ok, owner, already, expired, invalid, blocked.
-- slots : places notées par leur nom, sans compte (on peut en reprendre une).
create or replace function public.ristourne_invite_check(invite_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv ristourne_invites;
  r ristournes;
  st text;
begin
  if me is null then
    raise exception 'Connexion requise';
  end if;
  if (select count(*) from wallet_invite_attempts where user_id = me and at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('status', 'blocked');
  end if;
  select * into inv from ristourne_invites where code = c;
  if inv.code is not null then
    select * into r from ristournes where id = inv.ristourne_id and deleted_at is null;
  end if;
  if r.id is null then
    insert into wallet_invite_attempts (user_id) values (me);
    return jsonb_build_object('status', 'invalid');
  end if;
  if inv.revoked or inv.expires_at <= now() then
    return jsonb_build_object('status', 'expired', 'ristourne_name', r.name);
  end if;
  st := case
    when r.owner_id = me then 'owner'
    when exists (select 1 from ristourne_members where ristourne_id = r.id and user_id = me and status = 'active' and deleted_at is null) then 'already'
    else 'ok'
  end;
  return jsonb_build_object(
    'status', st,
    'code', c,
    'ristourne_id', r.id,
    'ristourne_name', r.name,
    'owner_name', person_name(r.owner_id),
    'contribution', r.contribution,
    'currency', r.currency,
    'frequency', r.frequency,
    'every_days', r.every_days,
    'members', (select count(*) from ristourne_members where ristourne_id = r.id and status <> 'removed' and deleted_at is null),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'turn', turn) order by turn)
        from ristourne_members
       where ristourne_id = r.id and user_id is null and status <> 'removed' and deleted_at is null
    ), '[]'::jsonb)
  );
end $$;

-- Rejoindre avec un code. claim : une place notée par son nom à reprendre (sinon : nouveau membre, dernier tour).
create or replace function public.join_ristourne(invite_code text, member_name text default null, claim uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  info jsonb := ristourne_invite_check(invite_code);
  rid uuid;
  nm text;
  mid uuid;
begin
  if info ->> 'status' <> 'ok' then
    return info;
  end if;
  rid := (info ->> 'ristourne_id')::uuid;
  nm := left(coalesce(nullif(trim(member_name), ''), person_name(me)), 60);
  update profiles set name = nm where id = me and trim(name) = '';

  -- Place choisie (« Je suis Kemy ») : seulement une place sans compte de cette ristourne
  if claim is not null then
    select id into mid from ristourne_members
     where id = claim and ristourne_id = rid and user_id is null and status <> 'removed' and deleted_at is null;
  end if;
  -- Déjà une place (retiré puis réinvité, ou invité par e-mail) : on la reprend
  if mid is null then
    select id into mid from ristourne_members where ristourne_id = rid and user_id = me;
  end if;
  if mid is null and mail <> '' then
    select id into mid from ristourne_members
     where ristourne_id = rid and user_id is null and lower(email) = mail and status <> 'removed' and deleted_at is null
     limit 1;
  end if;

  if mid is not null then
    update ristourne_members set user_id = me, status = 'active', deleted_at = null,
      name = case when claim is not null then name else nm end
     where id = mid;
  else
    insert into ristourne_members (ristourne_id, user_id, email, name, turn, status)
    values (
      rid, me, nullif(mail, ''), nm,
      coalesce((select max(turn) from ristourne_members where ristourne_id = rid and status <> 'removed' and deleted_at is null), 0) + 1,
      'active'
    )
    returning id into mid;
  end if;

  return info || jsonb_build_object('status', 'joined', 'member_id', mid);
end $$;

revoke all on function public.create_ristourne_invite(uuid), public.revoke_ristourne_invites(uuid),
  public.ristourne_invite_check(text), public.join_ristourne(text, text, uuid) from public, anon;
grant execute on function public.create_ristourne_invite(uuid), public.revoke_ristourne_invites(uuid),
  public.ristourne_invite_check(text), public.join_ristourne(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Qui garde l'argent, et paiements à confirmer
-- ---------------------------------------------------------------------------
-- • keeper_member_id : le membre qui garde la cagnotte (vide = l'organisateur).
--   holding : 'cash' (en main) ou 'digital' (sur un compte) ; holding_details : n° Mobile Money, compte…
-- • Un paiement noté par un simple membre est « à confirmer » (pending) : seuls l'organisateur
--   et le gardien peuvent le confirmer (ou le refuser = le supprimer). Les paiements d'avant restent confirmés.

alter table public.ristournes
  add column keeper_member_id uuid,
  add column holding text check (holding in ('cash', 'digital')),
  add column holding_details text check (char_length(holding_details) <= 120);

alter table public.ristourne_payments add column pending boolean not null default false;

-- Suis-je l'organisateur ou le gardien de l'argent de cette ristourne ?
create or replace function public.can_confirm_ristourne(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ristournes where id = r and owner_id = auth.uid())
      or exists (
        select 1 from ristournes x join ristourne_members m on m.id = x.keeper_member_id
         where x.id = r and m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
      );
$$;
grant execute on function public.can_confirm_ristourne(uuid) to authenticated;

-- Garde-fou : un simple membre ne peut ni noter un paiement déjà confirmé, ni confirmer lui-même
create or replace function public.guard_ristourne_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.can_confirm_ristourne(new.ristourne_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pending := true;
  elsif old.pending and not new.pending then
    new.pending := true;
  end if;
  return new;
end $$;

create trigger ristourne_payments_guard before insert or update on public.ristourne_payments
  for each row execute function public.guard_ristourne_payment();

-- Le gardien peut aussi corriger / refuser un paiement (comme l'organisateur)
drop policy if exists "ristourne paiements : l'auteur ou le propriétaire corrige" on public.ristourne_payments;
create policy "ristourne paiements : l'auteur, l'organisateur ou le gardien corrige" on public.ristourne_payments for update
  using (recorded_by = auth.uid() or public.can_confirm_ristourne(ristourne_id))
  with check (public.is_ristourne_member(ristourne_id));
