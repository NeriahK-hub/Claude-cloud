-- Wallo : espace d'administration (site admin séparé)
-- À exécuter dans Supabase › SQL Editor après 20261001000000_wallet_invite_links.sql.
--
-- Principe
-- • Les administrateurs sont listés dans une table fermée (public.admins) : l'app ne peut ni la lire
--   ni l'écrire. On s'y ajoute à la main, ici, dans le SQL Editor (voir tout en bas).
-- • L'admin ne voit PAS les opérations ni les montants des utilisateurs : seulement des chiffres
--   globaux et, par compte, des nombres (portefeuilles, opérations) et des dates.
-- • Tout ce que l'app lit (fonctionnalités, annonces, icônes) passe par app_config(), lisible sans
--   compte : l'app marche aussi pour les personnes non connectées.

-- ---------------------------------------------------------------------------
-- Administrateurs
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security; -- aucune règle : invisible depuis l'app
revoke all on table public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- Garde-fou commun des fonctions admin
create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fonctionnalités activables (absent ou activé = disponible dans l'app)
-- ---------------------------------------------------------------------------

create table public.app_features (
  key text primary key check (key ~ '^[a-z][a-zA-Z]{1,40}$'),
  label text not null,
  description text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger app_features_touch before insert or update on public.app_features for each row execute function public.touch_updated_at();

insert into public.app_features (key, label, description) values
  ('debts', 'Dettes et prêts', 'Onglet « Dette / Prêt » à l''ajout et page Dettes et prêts'),
  ('budgets', 'Budgets', 'Page Budgets et raccourci de l''accueil'),
  ('ristournes', 'Ristournes', 'Tontines : page Ristourne et raccourci de l''accueil'),
  ('sharedWallets', 'Portefeuilles partagés', 'Inviter des membres et rejoindre un portefeuille partagé'),
  ('importData', 'Import de fichiers', 'Import Money Lover / Excel / CSV dans Paramètres'),
  ('accounts', 'Connexion / comptes', 'Se connecter et synchroniser (les personnes déjà connectées restent connectées)');

-- ---------------------------------------------------------------------------
-- Annonces (apparaissent dans les notifications de tout le monde)
-- ---------------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  message text not null check (char_length(message) between 1 and 600),
  kind text not null default 'info' check (kind in ('info', 'update', 'warning')),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Icônes proposées à tout le monde (en plus des icônes perso de chacun)
-- ---------------------------------------------------------------------------

create table public.global_icons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  data_url text not null check ((data_url like 'data:image/svg+xml%' or data_url like 'data:image/png%') and char_length(data_url) <= 60000),
  keep_colors boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Règles d'accès : lecture pour tous (via app_config), écriture pour les admins seulement
alter table public.app_features enable row level security;
alter table public.announcements enable row level security;
alter table public.global_icons enable row level security;
revoke all on table public.app_features, public.announcements, public.global_icons from anon, authenticated;
grant select, update on public.app_features to authenticated;
grant select, insert, update, delete on public.announcements, public.global_icons to authenticated;

create policy "fonctionnalités : admin" on public.app_features for all using (public.is_admin()) with check (public.is_admin());
create policy "annonces : admin" on public.announcements for all using (public.is_admin()) with check (public.is_admin());
create policy "icônes globales : admin" on public.global_icons for all using (public.is_admin()) with check (public.is_admin());

-- Ce que l'app lit au démarrage (une seule requête, sans compte)
create or replace function public.app_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'features', coalesce((select jsonb_object_agg(key, enabled) from app_features), '{}'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'message', message, 'kind', kind, 'created_at', created_at) order by created_at desc)
        from announcements where active and (expires_at is null or expires_at > now())
    ), '[]'::jsonb),
    'icons', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'data_url', data_url, 'keep_colors', keep_colors) order by sort_order, created_at)
        from global_icons
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.app_config() from public;
grant execute on function public.app_config() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Statistiques globales (aucun montant, aucune donnée personnelle)
-- ---------------------------------------------------------------------------

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
begin
  perform public.require_admin();
  with activity as (
    -- Dernière activité d'un compte : une opération ajoutée ou modifiée
    select created_by as user_id, max(updated_at) as at from transactions where created_by is not null group by created_by
  )
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_7d', (select count(*) from activity where at > now() - interval '7 days'),
    'active_30d', (select count(*) from activity where at > now() - interval '30 days'),
    'banned', (select count(*) from auth.users where banned_until > now()),
    'wallets', (select count(*) from wallets where deleted_at is null),
    'shared_wallets', (select count(distinct m.wallet_id) from wallet_members m join wallets w on w.id = m.wallet_id
                        where m.role <> 'owner' and m.status = 'active' and m.user_id is not null and m.deleted_at is null and w.deleted_at is null),
    'transactions', (select count(*) from transactions where deleted_at is null),
    'transactions_30d', (select count(*) from transactions where deleted_at is null and occurred_at > now() - interval '30 days'),
    'ristournes', (select count(*) from ristournes where deleted_at is null),
    'signups_by_day', (
      select jsonb_agg(jsonb_build_object('day', d::date, 'n', (select count(*) from auth.users u where u.created_at::date = d::date)) order by d)
        from generate_series(current_date - 29, current_date, interval '1 day') d
    )
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- Comptes : liste, blocage, suppression
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_users(search text default '', lim integer default 50, off integer default 0)
returns table (
  id uuid, email text, name text, created_at timestamptz, last_sign_in_at timestamptz,
  banned boolean, is_admin boolean, wallets bigint, transactions bigint, last_activity timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select u.id, u.email::text, coalesce(p.name, '')::text, u.created_at, u.last_sign_in_at,
           coalesce(u.banned_until > now(), false),
           exists (select 1 from admins a where a.user_id = u.id),
           (select count(*) from wallets w where w.owner_id = u.id and w.deleted_at is null),
           (select count(*) from transactions t where t.created_by = u.id and t.deleted_at is null),
           (select max(t.updated_at) from transactions t where t.created_by = u.id)
      from auth.users u
      left join profiles p on p.id = u.id
     where coalesce(search, '') = ''
        or u.email ilike '%' || search || '%'
        or p.name ilike '%' || search || '%'
     order by u.created_at desc
     limit least(greatest(lim, 1), 200) offset greatest(off, 0);
end $$;

create or replace function public.admin_set_banned(target uuid, ban boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if target = auth.uid() then
    raise exception 'Tu ne peux pas bloquer ton propre compte';
  end if;
  if exists (select 1 from admins where user_id = target) then
    raise exception 'Impossible de bloquer un administrateur';
  end if;
  update auth.users set banned_until = case when ban then now() + interval '100 years' else null end where id = target;
  -- Bloqué : ses connexions en cours s'arrêtent (la table n'existe que sur Supabase)
  if ban and to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using target;
  end if;
end $$;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if target = auth.uid() then
    raise exception 'Pour supprimer ton propre compte, passe par l''app';
  end if;
  if exists (select 1 from admins where user_id = target) then
    raise exception 'Impossible de supprimer un administrateur';
  end if;
  -- Comme « Supprimer mon compte » : quitte les portefeuilles partagés des autres, le reste suit
  update wallet_members set status = 'removed'
   where user_id = target and wallet_id not in (select id from wallets where owner_id = target);
  delete from auth.users where id = target;
end $$;

revoke all on function public.is_admin(), public.require_admin(), public.admin_stats(),
  public.admin_list_users(text, integer, integer), public.admin_set_banned(uuid, boolean), public.admin_delete_user(uuid)
  from public, anon;
grant execute on function public.is_admin(), public.admin_stats(), public.admin_list_users(text, integer, integer),
  public.admin_set_banned(uuid, boolean), public.admin_delete_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Devenir administrateur (à faire une fois, à la main, avec TON adresse) :
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'ton.adresse@exemple.com';
-- ---------------------------------------------------------------------------
