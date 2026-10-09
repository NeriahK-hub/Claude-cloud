-- Wallo Pro : l'offre (invisible tant que l'admin ne l'allume pas), la liste des fonctionnalites gratuites / Pro,
-- et les comptes a qui l'admin donne l'acces. Pas de prix ni de paiement pour l'instant.
-- A executer une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run (apres 20261024).
-- Les textes sont ecrits en codes \XXXX : les accents ne s'abiment pas au copier-coller.

-- 1. Interrupteur (eteint au depart) : "Passer a Wallo Pro" n'apparait dans Profil que si l'admin l'allume
insert into public.app_features (key, label, description, enabled) values
  ('pro', U&'Wallo Pro (offre payante)', U&'Allum\00E9 : \00AB Passer \00E0 Wallo Pro \00BB appara\00EEt dans Profil, avec la liste de ce qui est gratuit et de ce qui est Pro.', false)
on conflict (key) do nothing;

-- 2. Ce qui est gratuit / Pro (modifiable depuis l'admin, page "Wallo Pro")
create table if not exists public.pro_features (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 2 and 80),
  description text not null default '' check (char_length(description) <= 200),
  tier text not null default 'pro' check (tier in ('free', 'pro')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.pro_features enable row level security;
revoke all on table public.pro_features from anon, authenticated;
grant select, insert, update, delete on public.pro_features to authenticated;
drop policy if exists "pro : admin" on public.pro_features;
create policy "pro : admin" on public.pro_features for all using (public.is_admin()) with check (public.is_admin());

-- Liste de depart (a modifier dans l'admin) : seulement si la table est vide
insert into public.pro_features (label, description, tier, sort_order)
select * from (values
  (U&'Portefeuilles en dollars et en francs', U&'Autant de portefeuilles que tu veux, USD et CDF.', 'free', 0),
  (U&'Op\00E9rations et cat\00E9gories', U&'Noter tes d\00E9penses et revenus, sans limite.', 'free', 1),
  (U&'Budgets', U&'Un budget par cat\00E9gorie, avec le rythme du mois.', 'free', 2),
  (U&'Dettes et pr\00EAts', U&'Qui te doit, \00E0 qui tu dois, avec les rappels.', 'free', 3),
  (U&'\00C0 venir', U&'Factures et abonnements, avec rappel.', 'free', 4),
  (U&'Portefeuilles partag\00E9s', U&'Suivre l''argent \00E0 plusieurs, en direct.', 'pro', 5),
  (U&'Synchro sur tous tes appareils', U&'Ton compte et tes donn\00E9es partout, en s\00E9curit\00E9.', 'pro', 6),
  (U&'Rapports en PDF et Excel', U&'Exporter tes rapports pour les partager.', 'pro', 7),
  (U&'Analyses avanc\00E9es', U&'Courbe sur 12 mois, simulateur, d\00E9penses inhabituelles.', 'pro', 8)
) as v(label, description, tier, sort_order)
where not exists (select 1 from public.pro_features);

-- 3. Qui a Wallo Pro (donne a la main par l'admin, avec une date de fin facultative)
create table if not exists public.pro_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 120),
  until timestamptz,
  granted_at timestamptz not null default now()
);
alter table public.pro_access enable row level security;
revoke all on table public.pro_access from anon, authenticated;
grant select on public.pro_access to authenticated;
drop policy if exists "pro : admin" on public.pro_access;
create policy "pro : admin" on public.pro_access for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pro : le mien" on public.pro_access;
create policy "pro : le mien" on public.pro_access for select using (user_id = auth.uid());

-- Moi, ai-je Wallo Pro ? (l'app le demande une fois connecte)
create or replace function public.my_pro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pro_access where user_id = auth.uid() and (until is null or until > now()));
$$;

create or replace function public.admin_pro_grant(p_email text, p_until timestamptz default null, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  perform public.require_admin();
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'Aucun compte avec cette adresse';
  end if;
  insert into pro_access (user_id, note, until) values (uid, coalesce(p_note, ''), p_until)
  on conflict (user_id) do update set note = excluded.note, until = excluded.until, granted_at = now();
end $$;

create or replace function public.admin_pro_revoke(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from pro_access where user_id = target;
end $$;

create or replace function public.admin_pro_list() returns table (user_id uuid, email text, note text, until timestamptz, granted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select a.user_id, u.email::text, a.note, a.until, a.granted_at
      from pro_access a join auth.users u on u.id = a.user_id
     order by a.granted_at desc;
end $$;

revoke all on function public.my_pro(), public.admin_pro_grant(text, timestamptz, text), public.admin_pro_revoke(uuid), public.admin_pro_list() from public, anon;
grant execute on function public.my_pro(), public.admin_pro_grant(text, timestamptz, text), public.admin_pro_revoke(uuid), public.admin_pro_list() to authenticated;

-- La suite (app_config) est dans 20261026000000_pro_config.sql : a executer juste apres.
