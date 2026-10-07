-- Wallo : compteur anonyme de ce qui sert vraiment dans l'app (lu dans l'espace admin, page « Usage »)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261016000000_festive.sql).
--
-- Aucune donnée sur la personne : ni compte, ni appareil, ni adresse. Seulement, pour chaque jour,
-- « tel écran / outil a été ouvert sur N appareils ». Chaque appareil compte au plus 1 fois par jour et par outil.

create table if not exists public.usage_daily (
  day date not null,
  feature text not null,
  devices integer not null default 0,
  primary key (day, feature)
);
alter table public.usage_daily enable row level security; -- aucune règle : on passe par les fonctions
revoke all on table public.usage_daily from anon, authenticated;

-- Envoyé par l'app (avec ou sans compte) : une liste de noms d'outils ouverts aujourd'hui
create or replace function public.track_usage(p_features text[], p_day date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d date := coalesce(p_day, current_date);
begin
  if p_features is null then
    return;
  end if;
  -- Jour envoyé par le téléphone (hors ligne : la file part plus tard) : seulement les 7 derniers jours
  if d > current_date + 1 or d < current_date - 7 then
    d := current_date;
  end if;
  insert into usage_daily (day, feature, devices)
  select d, f, 1
    from (select distinct f from unnest(p_features[1:40]) as f where f ~ '^[a-z0-9_.-]{1,40}$') x
  on conflict (day, feature) do update set devices = usage_daily.devices + 1;
end $$;
revoke all on function public.track_usage(text[], date) from public;
grant execute on function public.track_usage(text[], date) to anon, authenticated;

-- Admin : pour chaque outil, appareils sur les 7 derniers jours, les 7 d'avant, et sur p_days jours
create or replace function public.admin_usage(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.total desc)
      from (
        select feature,
               sum(devices) filter (where day > current_date - 7)::int as last7,
               sum(devices) filter (where day <= current_date - 7 and day > current_date - 14)::int as prev7,
               sum(devices)::int as total,
               max(day) as last_day
          from usage_daily
         where day > current_date - greatest(1, least(coalesce(p_days, 30), 365))
         group by feature
      ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_usage(integer) from public;
grant execute on function public.admin_usage(integer) to authenticated;
