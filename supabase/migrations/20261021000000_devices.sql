-- Wallo : « Appareils connectés » (Profil › compte) : voir les appareils où ton compte est ouvert
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261020000000_recurring_cancel.sql).
--
-- Chaque appareil se déclare à l'ouverture (une clé au hasard gardée sur l'appareil, un nom lisible
-- comme « iPhone · Safari »). La déconnexion des autres appareils passe par Supabase Auth
-- (signOut scope « others ») : cette table ne sert qu'à les afficher.

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_key text not null,
  name text not null,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_key)
);
alter table public.devices enable row level security; -- aucune règle : on passe par les fonctions
revoke all on table public.devices from anon, authenticated;

create or replace function public.register_device(p_key text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into devices (user_id, device_key, name)
  values (auth.uid(), left(p_key, 64), left(coalesce(nullif(trim(p_name), ''), 'Appareil'), 80))
  on conflict (user_id, device_key) do update set name = excluded.name, last_seen = now();
  -- pas plus de 20 appareils gardés : les plus anciens partent
  delete from devices
   where user_id = auth.uid()
     and id in (select id from devices where user_id = auth.uid() order by last_seen desc offset 20);
end $$;
revoke all on function public.register_device(text, text) from public, anon;
grant execute on function public.register_device(text, text) to authenticated;

create or replace function public.my_devices() returns table (id uuid, device_key text, name text, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.device_key, d.name, d.last_seen from devices d where d.user_id = auth.uid() order by d.last_seen desc;
$$;
revoke all on function public.my_devices() from public, anon;
grant execute on function public.my_devices() to authenticated;

create or replace function public.forget_device(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from devices where id = p_id and user_id = auth.uid();
$$;
revoke all on function public.forget_device(uuid) from public, anon;
grant execute on function public.forget_device(uuid) to authenticated;
