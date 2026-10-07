-- Wallo : « Donner mon avis » (depuis le Profil de l'app), lu dans l'espace admin
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261012000000_upcoming.sql).

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null, -- null : avis envoyé sans compte
  mood smallint check (mood between 1 and 5), -- 1 pas content … 5 très content
  kind text not null default 'other' check (kind in ('idea', 'problem', 'other')),
  message text not null check (char_length(message) between 1 and 2000),
  app_version text,
  device text,
  status text not null default 'new' check (status in ('new', 'read', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_by_date on public.feedback (created_at desc);
alter table public.feedback enable row level security; -- aucune règle : on passe par les fonctions

-- Envoyer un avis (avec ou sans compte). Au plus 20 avis par jour et par compte.
create or replace function public.send_feedback(p_mood smallint, p_kind text, p_message text, p_app text default null, p_device text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if p_message is null or char_length(trim(p_message)) = 0 then
    raise exception 'Message vide';
  end if;
  if me is not null and (select count(*) from feedback where user_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Trop d''avis envoyés aujourd''hui';
  end if;
  insert into feedback (user_id, mood, kind, message, app_version, device)
  values (
    me,
    case when p_mood between 1 and 5 then p_mood else null end,
    case when p_kind in ('idea', 'problem', 'other') then p_kind else 'other' end,
    left(trim(p_message), 2000),
    left(p_app, 40),
    left(p_device, 200)
  );
end $$;
revoke all on function public.send_feedback(smallint, text, text, text, text) from public;
grant execute on function public.send_feedback(smallint, text, text, text, text) to anon, authenticated;

-- Admin : la liste (les plus récents d'abord), avec l'e-mail du compte s'il y en a un
create or replace function public.admin_feedback(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
      from (
        select f.id, f.mood, f.kind, f.message, f.app_version, f.device, f.status, f.created_at, u.email
          from feedback f left join auth.users u on u.id = f.user_id
         where p_status is null or f.status = p_status
         order by f.created_at desc
         limit 500
      ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_feedback(text) from public, anon;
grant execute on function public.admin_feedback(text) to authenticated;

create or replace function public.admin_feedback_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_status not in ('new', 'read', 'done') then
    raise exception 'Statut invalide';
  end if;
  update feedback set status = p_status where id = p_id;
end $$;
revoke all on function public.admin_feedback_set_status(uuid, text) from public, anon;
grant execute on function public.admin_feedback_set_status(uuid, text) to authenticated;

create or replace function public.admin_feedback_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from feedback where id = p_id;
end $$;
revoke all on function public.admin_feedback_delete(uuid) from public, anon;
grant execute on function public.admin_feedback_delete(uuid) to authenticated;
