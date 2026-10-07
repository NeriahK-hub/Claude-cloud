-- Wallo : inviter dans un portefeuille partagé avec un lien (ou un code)
-- À exécuter dans Supabase › SQL Editor après 20260930000000_delete_account.sql.
--
-- Principe
-- • Le propriétaire crée un code (ex. K7P4QX9M) valable 7 jours, qu'il envoie par WhatsApp
--   sous forme de lien https://…/r/K7P4QX9M. Le même code sert tant qu'il est valable.
-- • La personne qui l'ouvre se connecte (n'importe quelle adresse) et rejoint le portefeuille :
--   plus besoin de connaître son e-mail à l'avance.
-- • Les codes ne sont lisibles par personne directement : tout passe par les fonctions ci-dessous.
-- • Trop de codes faux (20 en une heure) : on bloque, pour empêcher de deviner des codes.
-- • Retirer un membre annule les liens en cours (il ne peut pas revenir avec l'ancien lien).

create table public.wallet_invites (
  code text primary key,
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index wallet_invites_by_wallet on public.wallet_invites (wallet_id);

-- Codes faux essayés (pour limiter les essais)
create table public.wallet_invite_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index wallet_invite_attempts_by_user on public.wallet_invite_attempts (user_id, at);

-- Aucune règle d'accès : invisibles depuis l'app, seulement via les fonctions
alter table public.wallet_invites enable row level security;
alter table public.wallet_invite_attempts enable row level security;
revoke all on table public.wallet_invites, public.wallet_invite_attempts from anon, authenticated;

-- Nom affiché d'une personne : son nom de profil, sinon le début de son e-mail
create or replace function public.person_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(trim(name), '') from profiles where id = uid),
    (select nullif(split_part(email, '@', 1), '') from auth.users where id = uid),
    'Quelqu''un'
  );
$$;

-- Créer (ou reprendre) le code d'invitation d'un portefeuille : propriétaire seulement
create or replace function public.create_wallet_invite(w uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  -- Sans 0/O, 1/I/L : rien à confondre en le recopiant
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  inv wallet_invites;
  c text;
begin
  if not exists (select 1 from wallets where id = w and owner_id = auth.uid() and deleted_at is null) then
    raise exception 'Seul le propriétaire du portefeuille peut inviter';
  end if;
  -- Un code encore valable au moins un jour : on le réutilise
  select * into inv from wallet_invites
   where wallet_id = w and not revoked and expires_at > now() + interval '1 day'
   order by expires_at desc limit 1;
  if inv.code is null then
    loop
      c := '';
      for i in 1..8 loop
        c := c || substr(alphabet, 1 + get_byte(uuid_send(gen_random_uuid()), 0) % length(alphabet), 1);
      end loop;
      begin
        insert into wallet_invites (code, wallet_id, created_by) values (c, w, auth.uid()) returning * into inv;
        exit;
      exception when unique_violation then
        -- code déjà pris (très rare) : on en tire un autre
      end;
    end loop;
  end if;
  return jsonb_build_object('code', inv.code, 'expires_at', inv.expires_at);
end $$;

-- Annuler les liens en cours d'un portefeuille : propriétaire seulement
create or replace function public.revoke_wallet_invites(w uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from wallets where id = w and owner_id = auth.uid()) then
    raise exception 'Seul le propriétaire du portefeuille peut annuler une invitation';
  end if;
  update wallet_invites set revoked = true where wallet_id = w and not revoked;
end $$;

-- Ce que dit un code, avant de rejoindre. status : ok, owner (c'est le mien), already (j'en fais
-- déjà partie), expired (expiré ou annulé), invalid (n'existe pas), blocked (trop d'essais)
create or replace function public.wallet_invite_check(invite_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv wallet_invites;
  w wallets;
  st text;
begin
  if me is null then
    raise exception 'Connexion requise';
  end if;
  if (select count(*) from wallet_invite_attempts where user_id = me and at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('status', 'blocked');
  end if;
  select * into inv from wallet_invites where code = c;
  if inv.code is not null then
    select * into w from wallets where id = inv.wallet_id and deleted_at is null;
  end if;
  if w.id is null then
    insert into wallet_invite_attempts (user_id) values (me);
    return jsonb_build_object('status', 'invalid');
  end if;
  if inv.revoked or inv.expires_at <= now() then
    return jsonb_build_object('status', 'expired', 'wallet_name', w.name);
  end if;
  st := case
    when w.owner_id = me then 'owner'
    when exists (select 1 from wallet_members where wallet_id = w.id and user_id = me and status = 'active' and deleted_at is null) then 'already'
    else 'ok'
  end;
  return jsonb_build_object(
    'status', st,
    'code', c,
    'wallet_id', w.id,
    'wallet_name', w.name,
    'currency', w.currency,
    'owner_name', person_name(w.owner_id),
    'members', (select count(*) from wallet_members where wallet_id = w.id and status = 'active' and deleted_at is null)
  );
end $$;

-- Rejoindre avec un code. Renvoie la même chose que wallet_invite_check, avec status = joined
-- si c'est fait. member_name : le prénom que les autres membres verront (sinon celui du profil).
create or replace function public.join_wallet(invite_code text, member_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  info jsonb := wallet_invite_check(invite_code);
  wid uuid;
  nm text;
  mid uuid;
  palette constant text[] := array['#EC4899', '#3B82F6', '#F97316', '#14B8A6', '#8B5CF6', '#EAB308', '#EF4444', '#059669'];
begin
  if info ->> 'status' <> 'ok' then
    return info;
  end if;
  wid := (info ->> 'wallet_id')::uuid;
  nm := left(coalesce(nullif(trim(member_name), ''), person_name(me)), 60);
  -- Le prénom donné ici devient aussi celui du profil, s'il n'y en avait pas
  update profiles set name = nm where id = me and trim(name) = '';

  -- Déjà une place dans ce portefeuille (retiré puis réinvité, ou invité par e-mail) : on la reprend
  select id into mid from wallet_members where wallet_id = wid and user_id = me;
  if mid is null and mail <> '' then
    select id into mid from wallet_members
     where wallet_id = wid and user_id is null and status = 'invited' and lower(email) = mail and deleted_at is null
     limit 1;
  end if;
  if mid is not null then
    update wallet_members set user_id = me, status = 'active', deleted_at = null, name = nm where id = mid;
  else
    insert into wallet_members (wallet_id, user_id, email, name, color, role, status)
    values (
      wid, me, nullif(mail, ''), nm,
      palette[1 + (select count(*) from wallet_members where wallet_id = wid and role = 'member') % array_length(palette, 1)],
      'member', 'active'
    )
    returning id into mid;
  end if;

  -- Le propriétaire, noté « Moi » à la création, prend son vrai nom pour les autres membres
  update wallet_members set name = person_name(user_id) where wallet_id = wid and role = 'owner' and name = 'Moi';

  return info || jsonb_build_object('status', 'joined', 'member_id', mid);
end $$;

-- Un membre retiré par le propriétaire : les liens en cours sont annulés
-- (quand c'est le membre lui-même qui quitte, les liens restent valables)
create or replace function public.revoke_invites_on_removal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'removed' and old.status <> 'removed' and new.role = 'member'
     and new.user_id is distinct from auth.uid() then
    update wallet_invites set revoked = true where wallet_id = new.wallet_id and not revoked;
  end if;
  return new;
end $$;

create trigger wallet_members_revoke_invites after update on public.wallet_members
  for each row execute function public.revoke_invites_on_removal();

-- Droits : seulement les personnes connectées, et jamais person_name directement
revoke all on function public.person_name(uuid) from public, anon, authenticated;
revoke all on function public.create_wallet_invite(uuid) from public, anon;
revoke all on function public.revoke_wallet_invites(uuid) from public, anon;
revoke all on function public.wallet_invite_check(text) from public, anon;
revoke all on function public.join_wallet(text, text) from public, anon;
grant execute on function public.create_wallet_invite(uuid) to authenticated;
grant execute on function public.revoke_wallet_invites(uuid) to authenticated;
grant execute on function public.wallet_invite_check(text) to authenticated;
grant execute on function public.join_wallet(text, text) to authenticated;
