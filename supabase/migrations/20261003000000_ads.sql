-- Wallo : publicités (bannières sur l'accueil, créées depuis l'espace admin)
-- À exécuter dans Supabase › SQL Editor après 20261002000000_admin.sql.
--
-- • Une bannière = une image (stockée dans le dossier public « banners » de Supabase Storage)
--   + un lien https facultatif. Format conseillé : 1600 × 400 px (4:1), voir l'espace admin.
-- • L'app les lit avec app_config() (sans compte). Vues et clics comptés, sans savoir qui.

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80), -- nom interne + texte lu par les lecteurs d'écran
  image_url text not null check (image_url like 'https://%' and char_length(image_url) <= 500),
  link_url text check (link_url is null or (link_url ~ '^https://[^\s]+$' and char_length(link_url) <= 500)),
  sponsored boolean not null default true, -- affiche « Sponsorisé » sur la bannière
  active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  sort_order integer not null default 0,
  views bigint not null default 0,
  clicks bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ads enable row level security;
revoke all on table public.ads from anon, authenticated;
grant select, insert, update, delete on public.ads to authenticated;
create policy "pubs : admin" on public.ads for all using (public.is_admin()) with check (public.is_admin());

-- Vue ou clic (appelé par l'app, même sans compte). Rien d'autre n'est enregistré.
create or replace function public.ad_event(ad uuid, kind text) returns void
language sql security definer set search_path = public as $$
  update ads set views = views + (kind = 'view')::int, clicks = clicks + (kind = 'click')::int
   where id = ad and active and kind in ('view', 'click');
$$;
revoke all on function public.ad_event(uuid, text) from public;
grant execute on function public.ad_event(uuid, text) to anon, authenticated;

-- app_config() renvoie aussi les pubs en cours
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
    ), '[]'::jsonb),
    'ads', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'image_url', image_url, 'link_url', link_url, 'sponsored', sponsored) order by sort_order, created_at desc)
        from ads
       where active and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at > now())
    ), '[]'::jsonb)
  );
$$;

-- Dossier d'images public « banners » : lecture pour tous (par lien), envoi et suppression par les admins.
-- (Seulement sur Supabase : la base de test locale n'a pas de Storage.)
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('banners', 'banners', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$drop policy if exists "bannières : envoi par un admin" on storage.objects$p$;
  execute $p$create policy "bannières : envoi par un admin" on storage.objects for insert to authenticated
    with check (bucket_id = 'banners' and public.is_admin())$p$;
  -- (la suppression passe par une lecture : les admins voient la liste du dossier)
  execute $p$drop policy if exists "bannières : liste pour un admin" on storage.objects$p$;
  execute $p$create policy "bannières : liste pour un admin" on storage.objects for select to authenticated
    using (bucket_id = 'banners' and public.is_admin())$p$;
  execute $p$drop policy if exists "bannières : suppression par un admin" on storage.objects$p$;
  execute $p$create policy "bannières : suppression par un admin" on storage.objects for delete to authenticated
    using (bucket_id = 'banners' and public.is_admin())$p$;
end $$;
