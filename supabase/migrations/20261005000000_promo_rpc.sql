-- Wallo : accès aux publicités par des fonctions au nom neutre (« promo »)
-- À exécuter dans Supabase › SQL Editor après 20261004000000_icon_folders.sql.
--
-- Pourquoi : les bloqueurs de pub (extensions Chrome, Safari…) bloquent toute adresse qui contient
-- « /ads » : l'espace admin ne pouvait plus activer / désactiver une pub (« Pas de connexion »),
-- et les vues / clics n'étaient pas comptés chez les personnes qui ont un bloqueur.
-- Les règles d'accès ne changent pas : réservé aux admins (sauf le comptage des vues et clics).

-- Liste complète (espace admin)
create or replace function public.admin_promos() returns setof public.ads
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query select * from ads order by sort_order, created_at desc;
end $$;

-- Nouvelle pub (espace admin). Renvoie son identifiant.
create or replace function public.admin_promo_create(
  p_title text, p_image_url text, p_link_url text default null, p_sponsored boolean default true,
  p_starts_at timestamptz default null, p_expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  perform public.require_admin();
  insert into ads (title, image_url, link_url, sponsored, starts_at, expires_at)
  values (p_title, p_image_url, nullif(trim(coalesce(p_link_url, '')), ''), p_sponsored, p_starts_at, p_expires_at)
  returning id into new_id;
  return new_id;
end $$;

-- Activer / arrêter une pub (espace admin)
create or replace function public.admin_promo_set_active(target uuid, is_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update ads set active = is_active where id = target;
end $$;

-- Supprimer une pub (espace admin). Renvoie l'adresse de son image (pour la retirer du stockage).
create or replace function public.admin_promo_delete(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  url text;
begin
  perform public.require_admin();
  delete from ads where id = target returning image_url into url;
  return url;
end $$;

-- Vue ou clic (appelé par l'app, même sans compte) : comme ad_event, sous un nom que les bloqueurs laissent passer
create or replace function public.promo_event(promo uuid, kind text) returns void
language sql security definer set search_path = public as $$
  update ads set views = views + (kind = 'view')::int, clicks = clicks + (kind = 'click')::int
   where id = promo and active and kind in ('view', 'click');
$$;

revoke all on function public.admin_promos(), public.admin_promo_create(text, text, text, boolean, timestamptz, timestamptz),
  public.admin_promo_set_active(uuid, boolean), public.admin_promo_delete(uuid), public.promo_event(uuid, text)
  from public, anon;
grant execute on function public.admin_promos(), public.admin_promo_create(text, text, text, boolean, timestamptz, timestamptz),
  public.admin_promo_set_active(uuid, boolean), public.admin_promo_delete(uuid) to authenticated;
grant execute on function public.promo_event(uuid, text) to anon, authenticated;

-- Dossier d'images au nom neutre pour les nouvelles bannières (« banners » est bloqué par les bloqueurs de pub).
-- Les images déjà envoyées dans « banners » restent où elles sont.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('visuals', 'visuals', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$drop policy if exists "visuels : envoi par un admin" on storage.objects$p$;
  execute $p$create policy "visuels : envoi par un admin" on storage.objects for insert to authenticated
    with check (bucket_id = 'visuals' and public.is_admin())$p$;
  execute $p$drop policy if exists "visuels : liste pour un admin" on storage.objects$p$;
  execute $p$create policy "visuels : liste pour un admin" on storage.objects for select to authenticated
    using (bucket_id = 'visuals' and public.is_admin())$p$;
  execute $p$drop policy if exists "visuels : suppression par un admin" on storage.objects$p$;
  execute $p$create policy "visuels : suppression par un admin" on storage.objects for delete to authenticated
    using (bucket_id = 'visuals' and public.is_admin())$p$;
end $$;
