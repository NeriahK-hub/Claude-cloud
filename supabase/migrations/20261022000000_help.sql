-- Wallo : articles d'aide ajoutés depuis l'espace admin (page « Aide »), affichés dans Profil › Aide et astuces
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261021000000_devices.sql). Les articles de base sont dans l'app ; ceux-ci s'y ajoutent.

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 4000),
  category text not null default 'Autres' check (char_length(category) between 1 and 40),
  platform text check (platform in ('iphone', 'android')), -- astuce propre à un téléphone (montrée en premier dessus)
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.help_articles enable row level security;
revoke all on table public.help_articles from anon, authenticated;
grant select, insert, update, delete on public.help_articles to authenticated;
drop policy if exists "aide : admin" on public.help_articles;
create policy "aide : admin" on public.help_articles for all using (public.is_admin()) with check (public.is_admin());

-- app_config() renvoie aussi les articles d'aide actifs
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
    ), '[]'::jsonb),
    'help', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'category', category, 'platform', platform) order by sort_order, created_at)
        from help_articles where active
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.app_config() from public;
grant execute on function public.app_config() to anon, authenticated;
