-- Wallo : taux du marché, opérations qui reviennent / factures, défis d'épargne
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261011000000_goals.sql). Puis les tâches planifiées de l'étape 7 de supabase/push_cron.sql.

-- ---------------------------------------------------------------------------
-- 1. Taux du marché (cambistes) : publié chaque jour depuis l'espace admin, lu par tout le monde.
--    Chaque personne peut ensuite le remplacer par le sien dans l'app (gardé sur son téléphone).
-- ---------------------------------------------------------------------------

create table if not exists public.market_rates (
  day date primary key,
  usd_cdf numeric not null check (usd_cdf > 0), -- combien de francs congolais pour 1 dollar
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.market_rates enable row level security; -- aucune règle : on passe par les fonctions

-- Les 60 derniers jours (sans compte : comme app_config)
create or replace function public.market_rates() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'usd_cdf', usd_cdf) order by day desc), '[]'::jsonb)
    from (select day, usd_cdf from market_rates where day > current_date - 60 order by day desc limit 60) r;
$$;
revoke all on function public.market_rates() from public;
grant execute on function public.market_rates() to anon, authenticated;

create or replace function public.admin_set_market_rate(p_day date, p_rate numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_rate is null or p_rate <= 0 then
    raise exception 'Taux invalide';
  end if;
  insert into market_rates (day, usd_cdf, updated_by) values (coalesce(p_day, current_date), p_rate, auth.uid())
  on conflict (day) do update set usd_cdf = excluded.usd_cdf, updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.admin_set_market_rate(date, numeric) from public, anon;
grant execute on function public.admin_set_market_rate(date, numeric) to authenticated;

create or replace function public.admin_delete_market_rate(p_day date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  delete from market_rates where day = p_day;
end $$;
revoke all on function public.admin_delete_market_rate(date) from public, anon;
grant execute on function public.admin_delete_market_rate(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Opérations qui reviennent et factures
--    Visibles par celle / celui qui les a créées et par les membres du portefeuille (partagé).
--    Une échéance payée crée une opération dont l'identifiant est calculé (même échéance = même
--    identifiant) : deux téléphones qui la créent en même temps n'en font qu'une.
-- ---------------------------------------------------------------------------

create table if not exists public.recurrings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  title text not null,
  amount numeric check (amount > 0), -- null : montant demandé au moment de payer
  currency text not null,
  direction text not null default 'out' check (direction in ('in', 'out')),
  category_id text,
  frequency text not null check (frequency in ('week', 'month', 'year', 'days')),
  every_days integer check (every_days between 1 and 365),
  next_date date not null,
  anchor_day smallint check (anchor_day between 1 and 31), -- chaque mois / année : le jour voulu (le 31 revient après février)
  mode text not null default 'ask' check (mode in ('ask', 'auto')),
  is_bill boolean not null default false,
  remind_days integer not null default 3 check (remind_days between 0 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists recurrings_by_wallet on public.recurrings (wallet_id);
create index if not exists recurrings_by_user on public.recurrings (user_id);
create index if not exists recurrings_due on public.recurrings (next_date) where deleted_at is null and active;

drop trigger if exists recurrings_touch on public.recurrings;
create trigger recurrings_touch before insert or update on public.recurrings for each row execute function public.touch_updated_at();

alter table public.recurrings enable row level security;
drop policy if exists "récurrences : voir" on public.recurrings;
drop policy if exists "récurrences : ajouter" on public.recurrings;
drop policy if exists "récurrences : modifier" on public.recurrings;
create policy "récurrences : voir" on public.recurrings for select
  using (user_id = auth.uid() or public.is_wallet_member(wallet_id));
create policy "récurrences : ajouter" on public.recurrings for insert
  with check (user_id = auth.uid() and public.is_wallet_member(wallet_id));
-- Un membre peut marquer « payé » (la date avance) ; le portefeuille doit rester l'un des siens
create policy "récurrences : modifier" on public.recurrings for update
  using (user_id = auth.uid() or public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

-- Chaque matin : les factures 'remind_days' jours avant et le jour même, les opérations « me demander »
-- le jour venu. Envoyé à la personne qui l'a créée et aux membres du portefeuille. Le tag est le même que
-- l'alerte de l'app (App.tsx) : jamais deux fois sur un téléphone.
create or replace function public.push_recurring_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Africa/Kinshasa')::date;
  r record;
  u uuid;
  lvl text;
  how_much text;
  sent integer := 0;
begin
  for r in
    select * from recurrings
     where deleted_at is null and active
       and (next_date = today or (is_bill and next_date = today + remind_days and remind_days > 0) or (is_bill and next_date < today))
  loop
    lvl := case when r.next_date < today then 'late' when r.next_date = today then 'today' else 'soon' end;
    continue when lvl = 'late' and (today - r.next_date) not in (1, 3, 7); -- en retard : rappel au 1er, 3e et 7e jour
    continue when not r.is_bill and r.mode = 'auto'; -- créée toute seule à l'ouverture de l'app
    how_much := case when r.amount is null then '' else ' ' || push_money(r.amount, r.currency) end;
    for u in
      select r.user_id
      union
      select user_id from wallet_members
       where wallet_id = r.wallet_id and status = 'active' and deleted_at is null and user_id is not null
    loop
      perform push_notify(
        u,
        case when r.is_bill then 'Facture : ' || r.title else r.title end,
        case
          when r.is_bill and lvl = 'soon' then 'À payer avant le ' || to_char(r.next_date, 'DD/MM') || how_much || '.'
          when r.is_bill and lvl = 'today' then 'À payer aujourd''hui' || how_much || '.'
          when r.is_bill then 'En retard depuis le ' || to_char(r.next_date, 'DD/MM') || how_much || '.'
          when r.direction = 'in' then 'Prévu aujourd''hui' || how_much || ' : l''as-tu reçu ?'
          else 'Prévu aujourd''hui' || how_much || ' : est-ce payé ?'
        end,
        'rec-' || r.id || '-' || r.next_date || '-' || lvl,
        '/?upcoming=1'
      );
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end $$;
revoke execute on function public.push_recurring_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Défis d'épargne : un objectif dont le montant à mettre suit une règle
--    {"type": "52w" | "daily" | "weekend" | "roundup", "start": "AAAA-MM-JJ", "base": 1, "days": 30}
-- ---------------------------------------------------------------------------

alter table public.wallets add column if not exists challenge jsonb;

-- Rappel des objectifs (remplace celui de 20261011000000_goals.sql) :
-- • défi 52 semaines : le montant de la semaine = base × n° de la semaine ;
-- • défi « chaque jour » : tous les jours pendant la durée du défi, le montant de base ;
-- • sinon : le jour choisi, le montant choisi, si on a mis moins que ça depuis lundi.
create or replace function public.push_goal_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Africa/Kinshasa')::date;
  week_start timestamptz := (date_trunc('week', today::timestamp)) at time zone 'Africa/Kinshasa';
  day_start timestamptz := today::timestamp at time zone 'Africa/Kinshasa';
  g record;
  u uuid;
  sent integer := 0;
  day_name text;
  want numeric;
  put numeric;
  kind text;
  ch_start date;
begin
  day_name := (array['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'])[extract(dow from today)::int + 1];
  for g in
    select w.id, w.name, w.owner_id, w.currency, w.goal_amount, w.reminder_day, w.reminder_amount, w.goal_why, w.challenge,
           w.initial_balance + coalesce((select sum(t.amount) from transactions t where t.wallet_id = w.id and t.deleted_at is null), 0) as saved
      from wallets w
     where w.deleted_at is null and not w.archived and w.kind = 'goal'
       and (w.reminder_amount > 0 or w.challenge->>'type' in ('52w', 'daily'))
  loop
    continue when g.goal_amount is not null and g.saved >= g.goal_amount;
    kind := g.challenge->>'type';
    ch_start := nullif(g.challenge->>'start', '')::date;
    if kind = 'daily' then
      continue when ch_start is null or today < ch_start or today >= ch_start + coalesce((g.challenge->>'days')::int, 30);
      want := (g.challenge->>'base')::numeric;
      select coalesce(sum(t.amount), 0) into put from transactions t
       where t.wallet_id = g.id and t.deleted_at is null and t.amount > 0 and t.occurred_at >= day_start;
    else
      continue when g.reminder_day is distinct from extract(dow from today)::int;
      if kind = '52w' and ch_start is not null then
        want := (g.challenge->>'base')::numeric * least(52, greatest(1, (today - ch_start) / 7 + 1));
      else
        want := g.reminder_amount;
      end if;
      select coalesce(sum(t.amount), 0) into put from transactions t
       where t.wallet_id = g.id and t.deleted_at is null and t.amount > 0 and t.occurred_at >= week_start;
    end if;
    continue when want is null or put >= want;
    want := least(want - put, coalesce(g.goal_amount - g.saved, want));
    for u in
      select g.owner_id
      union
      select user_id from wallet_members
       where wallet_id = g.id and status = 'active' and deleted_at is null and user_id is not null
    loop
      perform push_notify(
        u,
        g.name,
        case when kind = 'daily' then 'Défi du jour : mets ' else 'C''est ' || day_name || ' : mets ' end
          || push_money(want, g.currency) || ' dans ' || g.name || '.'
          || coalesce(' ' || nullif(trim(g.goal_why), ''), ''),
        'goal-reminder-' || g.id || '-' || today,
        '/?goal=' || g.id || '&deposit=' || round(want, 2)
      );
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end $$;
revoke execute on function public.push_goal_reminders() from public, anon, authenticated;
