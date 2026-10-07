-- Imitation minimale de Supabase pour tester le schéma sur un PostgreSQL local
-- (NE PAS exécuter sur Supabase : ces objets y existent déjà).
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), last_sign_in_at timestamptz, banned_until timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Comme Supabase : les tables créées ensuite sont ouvertes aux rôles de l'API (les règles RLS filtrent)
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
