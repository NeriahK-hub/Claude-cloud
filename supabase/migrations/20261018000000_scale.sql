-- Wallo : tenir la charge avec des milliers de personnes
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261017000000_usage.sql). Ne change rien à qui voit quoi : mêmes règles, calculées plus vite.
--
-- 1. Règles d'accès (RLS) : la liste de mes portefeuilles / ristournes / dettes est calculée UNE fois
--    par requête (sous-requête « in (select …) »), au lieu d'une fonction appelée pour chaque ligne.
--    auth.uid() est aussi écrit « (select auth.uid()) » : évalué une fois (conseil officiel Supabase).
-- 2. Index pour la synchro : « mes lignes modifiées depuis X » lit directement les bonnes lignes.
-- 3. sync_check : une seule requête dit à l'app s'il y a du nouveau. Rien de changé = 1 appel au lieu de ~17.

-- ---------------------------------------------------------------------------
-- 1. Ensembles « à moi », calculés une fois
-- ---------------------------------------------------------------------------

create or replace function public.my_wallet_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from wallets where owner_id = auth.uid()
  union
  select wallet_id from wallet_members where user_id = auth.uid() and status = 'active' and deleted_at is null;
$$;

create or replace function public.my_ristourne_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from ristournes where owner_id = auth.uid()
  union
  select ristourne_id from ristourne_members where user_id = auth.uid() and status = 'active' and deleted_at is null;
$$;

create or replace function public.my_debt_share_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from debt_shares
   where deleted_at is null
     and ((owner_id = auth.uid() and owner_left_at is null)
       or (guest_id = auth.uid() and status = 'active' and guest_left_at is null));
$$;

revoke all on function public.my_wallet_ids(), public.my_ristourne_ids(), public.my_debt_share_ids() from public, anon;
grant execute on function public.my_wallet_ids(), public.my_ristourne_ids(), public.my_debt_share_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Règles de lecture réécrites (mêmes conditions qu'avant)
-- ---------------------------------------------------------------------------

drop policy if exists "profil : le sien" on public.profiles;
create policy "profil : le sien" on public.profiles for select using (id = (select auth.uid()));

drop policy if exists "portefeuilles : les miens et les partagés" on public.wallets;
create policy "portefeuilles : les miens et les partagés" on public.wallets for select
  using (owner_id = (select auth.uid()) or id in (select public.my_wallet_ids()));

drop policy if exists "membres : voir ceux de mes portefeuilles, ou mon invitation" on public.wallet_members;
create policy "membres : voir ceux de mes portefeuilles, ou mon invitation" on public.wallet_members for select
  using (wallet_id in (select public.my_wallet_ids()) or lower(email) = (select lower(coalesce(auth.jwt() ->> 'email', ''))));

drop policy if exists "transactions : voir celles de mes portefeuilles" on public.transactions;
create policy "transactions : voir celles de mes portefeuilles" on public.transactions for select
  using (wallet_id in (select public.my_wallet_ids()));

drop policy if exists "catégories : les miennes" on public.categories;
create policy "catégories : les miennes" on public.categories for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "budgets : les miens" on public.budgets;
create policy "budgets : les miens" on public.budgets for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "icônes : les miennes" on public.custom_icons;
create policy "icônes : les miennes" on public.custom_icons for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "ristournes : les miennes et celles où je suis membre" on public.ristournes;
create policy "ristournes : les miennes et celles où je suis membre" on public.ristournes for select
  using (owner_id = (select auth.uid()) or id in (select public.my_ristourne_ids()));

drop policy if exists "ristourne membres : voir" on public.ristourne_members;
create policy "ristourne membres : voir" on public.ristourne_members for select
  using (ristourne_id in (select public.my_ristourne_ids()) or lower(email) = (select lower(coalesce(auth.jwt() ->> 'email', ''))));

drop policy if exists "ristourne paiements : voir" on public.ristourne_payments;
create policy "ristourne paiements : voir" on public.ristourne_payments for select
  using (ristourne_id in (select public.my_ristourne_ids()));

drop policy if exists "dettes partagées : les miennes" on public.debt_shares;
create policy "dettes partagées : les miennes" on public.debt_shares for select
  using ((owner_id = (select auth.uid()) and owner_left_at is null)
      or (guest_id = (select auth.uid()) and status = 'active' and guest_left_at is null));

drop policy if exists "mouvements : voir" on public.debt_moves;
create policy "mouvements : voir" on public.debt_moves for select
  using (share_id in (select public.my_debt_share_ids()));

drop policy if exists "récurrences : voir" on public.recurrings;
create policy "récurrences : voir" on public.recurrings for select
  using (user_id = (select auth.uid()) or wallet_id in (select public.my_wallet_ids()));

drop policy if exists "abonnements push : les miens" on public.push_subscriptions;
create policy "abonnements push : les miens" on public.push_subscriptions for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Index de la synchro (« mes lignes modifiées depuis X ») et des liens entre tables
-- ---------------------------------------------------------------------------

create index if not exists transactions_wallet_sync on public.transactions (wallet_id, updated_at);
create index if not exists transactions_by_creator on public.transactions (created_by);
create index if not exists wallets_by_owner on public.wallets (owner_id, updated_at);
create index if not exists wallet_members_by_wallet on public.wallet_members (wallet_id, updated_at);
create index if not exists categories_sync on public.categories (user_id, updated_at);
create index if not exists budgets_sync on public.budgets (user_id, updated_at);
create index if not exists custom_icons_sync on public.custom_icons (user_id, updated_at);
create index if not exists ristournes_by_owner on public.ristournes (owner_id, updated_at);
create index if not exists ristourne_members_by_ristourne on public.ristourne_members (ristourne_id, updated_at);
create index if not exists ristourne_payments_by_ristourne on public.ristourne_payments (ristourne_id, updated_at);
create index if not exists debt_moves_sync on public.debt_moves (share_id, updated_at);
create index if not exists recurrings_wallet_sync on public.recurrings (wallet_id, updated_at);
create index if not exists recurrings_user_sync on public.recurrings (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- 3. sync_check : y a-t-il du nouveau ? (avec les droits de la personne : mêmes règles RLS)
--    p_since : { "transactions": "2026-10-07T10:00:00Z", … } (absent = la table est relue en entier)
--    Réponse : invitations acceptées, tables à relire, et ce que la personne voit encore
--    (portefeuilles, ristournes, dettes partagées) pour repérer ce qui lui a été retiré.
-- ---------------------------------------------------------------------------

create or replace function public.sync_check(p_since jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  t text;
  s timestamptz;
  hit boolean;
  changed text[] := '{}';
  invites integer;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  invites := public.accept_invites();
  foreach t in array array['profiles', 'categories', 'custom_icons', 'wallets', 'wallet_members', 'transactions', 'budgets',
                           'ristournes', 'ristourne_members', 'ristourne_payments', 'debt_shares', 'debt_moves', 'recurrings'] loop
    s := nullif(coalesce(p_since, '{}'::jsonb) ->> t, '')::timestamptz;
    if s is null then
      changed := changed || t;
      continue;
    end if;
    execute format('select exists (select 1 from public.%I where updated_at > $1)', t) using s into hit;
    if hit then
      changed := changed || t;
    end if;
  end loop;
  return jsonb_build_object(
    'invites', invites,
    'changed', to_jsonb(changed),
    'wallets', coalesce((select jsonb_agg(id) from wallets where deleted_at is null), '[]'::jsonb),
    'ristournes', coalesce((select jsonb_agg(id) from ristournes where deleted_at is null), '[]'::jsonb),
    'debt_shares', coalesce((select jsonb_agg(id) from debt_shares where deleted_at is null), '[]'::jsonb)
  );
end $$;
revoke all on function public.sync_check(jsonb) from public, anon;
grant execute on function public.sync_check(jsonb) to authenticated;
