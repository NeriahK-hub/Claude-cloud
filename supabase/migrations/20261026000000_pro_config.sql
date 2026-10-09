-- Wallo Pro, suite : app_config() renvoie aussi la liste gratuit / Pro.
-- A executer apres 20261025000000_pro.sql (SQL Editor > New query > coller ce fichier ENTIER > Run).
create or replace function public.app_config() returns jsonb
language sql stable security definer set search_path = public as $fn$
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
    ), '[]'::jsonb),
    'pro', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'description', description, 'tier', tier) order by sort_order, created_at)
        from pro_features
    ), '[]'::jsonb)
  );
$fn$;
revoke all on function public.app_config() from public;
grant execute on function public.app_config() to anon, authenticated;
