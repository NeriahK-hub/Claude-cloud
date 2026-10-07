-- Wallo : dossiers pour les icônes proposées à tous (Mobile Money, Banques, Télécoms…)
-- À exécuter dans Supabase › SQL Editor après 20261003000000_ads.sql.
-- Dans l'app, le choix d'icône les regroupe par dossier.

alter table public.global_icons
  add column folder text not null default 'Divers' check (char_length(folder) between 1 and 40);

create index global_icons_by_folder on public.global_icons (folder, sort_order, created_at);

-- app_config() renvoie aussi le dossier de chaque icône
create or replace function public.app_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'features', coalesce((select jsonb_object_agg(key, enabled) from app_features), '{}'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'message', message, 'kind', kind, 'created_at', created_at) order by created_at desc)
        from announcements where active and (expires_at is null or expires_at > now())
    ), '[]'::jsonb),
    'icons', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'data_url', data_url, 'keep_colors', keep_colors, 'folder', folder)
                       order by folder, sort_order, created_at)
        from global_icons
    ), '[]'::jsonb),
    'ads', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'image_url', image_url, 'link_url', link_url, 'sponsored', sponsored) order by sort_order, created_at desc)
        from ads
       where active and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at > now())
    ), '[]'::jsonb)
  );
$$;
