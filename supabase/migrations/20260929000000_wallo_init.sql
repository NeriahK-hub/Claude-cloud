-- Wallo : schéma de la base (Supabase / PostgreSQL)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run.
--
-- Principes
-- • Chaque ligne a updated_at (mis à jour par la base) et deleted_at (suppression « douce ») :
--   l'app hors ligne récupère ce qui a changé depuis sa dernière synchro, suppressions comprises.
-- • Données privées (catégories, budgets, icônes, réglages) : visibles par leur propriétaire seulement.
-- • Portefeuille partagé : visible et modifiable par ses membres actifs ; seul le propriétaire
--   invite, retire des membres ou supprime le portefeuille.
-- • Invitation par e-mail : la personne rejoint le portefeuille (ou la ristourne) en se connectant
--   avec cette adresse (fonction accept_invites()).
-- • Aucune suppression définitive depuis l'app : on marque deleted_at.

-- ---------------------------------------------------------------------------
-- Outils
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profils (un par compte) : nom affiché + réglages de devises
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  main_currency text not null default 'USD',
  second_currency text,
  rates jsonb not null default '{}'::jsonb, -- rates.X = combien de devise principale vaut 1 X
  updated_at timestamptz not null default now()
);

-- Profil créé automatiquement à l'inscription (nom fourni par Google s'il existe)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Portefeuilles et membres
-- ---------------------------------------------------------------------------

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default 'Wallet',
  image text, -- image choisie (data URL), facultative
  color text not null default '#059669',
  currency text not null,
  initial_balance numeric not null default 0,
  include_in_total boolean not null default true,
  archived boolean not null default false,
  kind text not null default 'basic' check (kind in ('basic', 'credit', 'goal')),
  credit_limit numeric,
  goal_amount numeric,
  goal_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Participants d'un portefeuille. Le propriétaire y figure aussi (role = 'owner').
-- user_id vide + email : invitation en attente. user_id vide + pas d'email : simple nom
-- (personne sans compte, ex. « Marie » notée sur ce téléphone).
create table public.wallet_members (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  name text not null default '',
  color text not null default '#3B82F6',
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('invited', 'active', 'removed')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index wallet_members_one_user on public.wallet_members (wallet_id, user_id) where user_id is not null;
create index wallet_members_by_user on public.wallet_members (user_id);
create index wallet_members_by_email on public.wallet_members (lower(email));

-- « Suis-je membre actif de ce portefeuille ? » (security definer : évite la récursion des règles)
create or replace function public.is_wallet_member(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from wallets where id = w and owner_id = auth.uid())
      or exists (select 1 from wallet_members m where m.wallet_id = w and m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null);
$$;

create or replace function public.is_wallet_owner(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from wallets where id = w and owner_id = auth.uid());
$$;

-- À la création d'un portefeuille : le propriétaire devient membre « owner »
create or replace function public.add_wallet_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into wallet_members (wallet_id, user_id, name, role, status, color)
  values (new.id, new.owner_id, coalesce((select nullif(name, '') from profiles where id = new.owner_id), 'Moi'), 'owner', 'active', '#475569');
  return new;
end $$;

-- Garde-fous : on ne change pas de propriétaire ; seul le propriétaire supprime
create or replace function public.guard_wallet() returns trigger
language plpgsql as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'Le propriétaire d''un portefeuille ne peut pas changer';
  end if;
  if new.deleted_at is distinct from old.deleted_at and old.owner_id <> auth.uid() then
    raise exception 'Seul le propriétaire peut supprimer ce portefeuille';
  end if;
  return new;
end $$;

create trigger wallets_touch before insert or update on public.wallets for each row execute function public.touch_updated_at();
create trigger wallets_guard before update on public.wallets for each row execute function public.guard_wallet();
create trigger wallets_owner_member after insert on public.wallets for each row execute function public.add_wallet_owner();
create trigger wallet_members_touch before insert or update on public.wallet_members for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete set null,
  member_id uuid, -- portefeuille partagé : qui a fait l'opération (wallet_members.id)
  title text not null,
  occurred_at timestamptz not null,
  amount numeric not null, -- positif = entrée, négatif = sortie, dans la devise du portefeuille
  currency text not null,
  original_amount numeric,
  original_currency text,
  type text not null check (type in ('receive', 'transfer', 'send', 'payment', 'adjustment')),
  category text not null default '',
  category_id text,
  avatar_type text not null default 'icon',
  avatar_value text not null default '',
  color text not null default '#64748B',
  reference_number text,
  transfer_id text, -- relie les deux moitiés d'un transfert (et ses frais)
  counterpart_wallet_id uuid,
  status text not null default 'completed',
  exclude_from_report boolean not null default false,
  with_person text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index transactions_by_wallet on public.transactions (wallet_id, occurred_at desc);
create index transactions_sync on public.transactions (updated_at);

create or replace function public.guard_transaction() returns trigger
language plpgsql as $$
begin
  new.created_by := old.created_by; -- l'auteur ne change pas
  return new;
end $$;

create trigger transactions_touch before insert or update on public.transactions for each row execute function public.touch_updated_at();
create trigger transactions_guard before update on public.transactions for each row execute function public.guard_transaction();

-- ---------------------------------------------------------------------------
-- Données privées : catégories, budgets, icônes personnalisées
-- (identifiants texte de l'app, uniques par personne)
-- ---------------------------------------------------------------------------

create table public.categories (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  type text not null check (type in ('expense', 'income', 'debt')),
  icon text not null default 'Tag',
  image text,
  color text not null default '#64748B',
  parent_id text,
  direction text check (direction in ('in', 'out')),
  custom boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id text, -- null = toutes les dépenses
  amount numeric not null check (amount > 0),
  currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.custom_icons (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  data_url text not null check (data_url like 'data:image/svg+xml%' or data_url like 'data:image/png%'),
  keep_colors boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create trigger profiles_touch before insert or update on public.profiles for each row execute function public.touch_updated_at();
create trigger categories_touch before insert or update on public.categories for each row execute function public.touch_updated_at();
create trigger budgets_touch before insert or update on public.budgets for each row execute function public.touch_updated_at();
create trigger custom_icons_touch before insert or update on public.custom_icons for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Ristournes (tontines) : membres, tours, paiements
-- ---------------------------------------------------------------------------

create table public.ristournes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  contribution numeric not null check (contribution > 0), -- cotisation de chaque membre, à chaque tour
  currency text not null,
  frequency text not null default 'monthly' check (frequency in ('weekly', 'biweekly', 'monthly')),
  start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.ristourne_members (
  id uuid primary key default gen_random_uuid(),
  ristourne_id uuid not null references public.ristournes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  name text not null,
  turn integer not null, -- tour où ce membre reçoit la cagnotte (1, 2, 3…)
  status text not null default 'active' check (status in ('invited', 'active', 'removed')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index ristourne_members_by_user on public.ristourne_members (user_id);
create index ristourne_members_by_email on public.ristourne_members (lower(email));

create table public.ristourne_payments (
  id uuid primary key default gen_random_uuid(),
  ristourne_id uuid not null references public.ristournes (id) on delete cascade,
  member_id uuid not null references public.ristourne_members (id) on delete cascade,
  turn integer not null,
  amount numeric not null check (amount > 0),
  paid_at timestamptz not null default now(),
  recorded_by uuid not null default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create or replace function public.is_ristourne_member(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ristournes where id = r and owner_id = auth.uid())
      or exists (select 1 from ristourne_members m where m.ristourne_id = r and m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null);
$$;

create or replace function public.is_ristourne_owner(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ristournes where id = r and owner_id = auth.uid());
$$;

create or replace function public.guard_ristourne() returns trigger
language plpgsql as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'Le propriétaire d''une ristourne ne peut pas changer';
  end if;
  return new;
end $$;

create trigger ristournes_touch before insert or update on public.ristournes for each row execute function public.touch_updated_at();
create trigger ristournes_guard before update on public.ristournes for each row execute function public.guard_ristourne();
create trigger ristourne_members_touch before insert or update on public.ristourne_members for each row execute function public.touch_updated_at();
create trigger ristourne_payments_touch before insert or update on public.ristourne_payments for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Invitations : rejoindre ce à quoi on a été invité avec son adresse e-mail
-- ---------------------------------------------------------------------------

create or replace function public.accept_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  n integer := 0;
  k integer;
begin
  if me is null or mail = '' then
    return 0;
  end if;
  update wallet_members set user_id = me, status = 'active'
   where lower(email) = mail and status = 'invited' and deleted_at is null
     and not exists (select 1 from wallet_members o where o.wallet_id = wallet_members.wallet_id and o.user_id = me);
  get diagnostics k = row_count; n := n + k;
  update ristourne_members set user_id = me, status = 'active'
   where lower(email) = mail and status = 'invited' and deleted_at is null;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Règles d'accès (Row Level Security)
-- Pas de règle DELETE : l'app supprime en remplissant deleted_at.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_members enable row level security;
alter table public.transactions enable row level security;
alter table public.categories enable row level security;
alter table public.budgets enable row level security;
alter table public.custom_icons enable row level security;
alter table public.ristournes enable row level security;
alter table public.ristourne_members enable row level security;
alter table public.ristourne_payments enable row level security;

create policy "profil : le sien" on public.profiles for select using (id = auth.uid());
create policy "profil : modifier le sien" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profil : créer le sien" on public.profiles for insert with check (id = auth.uid());

create policy "portefeuilles : les miens et les partagés" on public.wallets for select
  using (owner_id = auth.uid() or public.is_wallet_member(id));
create policy "portefeuilles : créer" on public.wallets for insert with check (owner_id = auth.uid());
create policy "portefeuilles : modifier si membre" on public.wallets for update
  using (public.is_wallet_member(id)) with check (public.is_wallet_member(id));

create policy "membres : voir ceux de mes portefeuilles, ou mon invitation" on public.wallet_members for select
  using (public.is_wallet_member(wallet_id) or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "membres : le propriétaire ajoute" on public.wallet_members for insert
  with check (public.is_wallet_owner(wallet_id) and role = 'member');
create policy "membres : le propriétaire modifie" on public.wallet_members for update
  using (public.is_wallet_owner(wallet_id)) with check (public.is_wallet_owner(wallet_id));

create policy "transactions : voir celles de mes portefeuilles" on public.transactions for select
  using (public.is_wallet_member(wallet_id));
create policy "transactions : ajouter dans mes portefeuilles" on public.transactions for insert
  with check (public.is_wallet_member(wallet_id) and created_by = auth.uid());
create policy "transactions : modifier dans mes portefeuilles" on public.transactions for update
  using (public.is_wallet_member(wallet_id)) with check (public.is_wallet_member(wallet_id));

create policy "catégories : les miennes" on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budgets : les miens" on public.budgets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "icônes : les miennes" on public.custom_icons for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ristournes : les miennes et celles où je suis membre" on public.ristournes for select
  using (owner_id = auth.uid() or public.is_ristourne_member(id));
create policy "ristournes : créer" on public.ristournes for insert with check (owner_id = auth.uid());
create policy "ristournes : le propriétaire modifie" on public.ristournes for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "ristourne membres : voir" on public.ristourne_members for select
  using (public.is_ristourne_member(ristourne_id) or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "ristourne membres : le propriétaire ajoute" on public.ristourne_members for insert
  with check (public.is_ristourne_owner(ristourne_id));
create policy "ristourne membres : le propriétaire modifie" on public.ristourne_members for update
  using (public.is_ristourne_owner(ristourne_id)) with check (public.is_ristourne_owner(ristourne_id));

create policy "ristourne paiements : voir" on public.ristourne_payments for select
  using (public.is_ristourne_member(ristourne_id));
create policy "ristourne paiements : un membre note un paiement" on public.ristourne_payments for insert
  with check (public.is_ristourne_member(ristourne_id) and recorded_by = auth.uid());
create policy "ristourne paiements : l'auteur ou le propriétaire corrige" on public.ristourne_payments for update
  using (recorded_by = auth.uid() or public.is_ristourne_owner(ristourne_id))
  with check (public.is_ristourne_member(ristourne_id));

-- Droits : les comptes connectés passent par les règles ci-dessus ; les visiteurs n'ont rien
revoke all on all tables in schema public from anon;
grant select, insert, update on all tables in schema public to authenticated;
grant execute on function public.accept_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- Temps réel : prévenir l'app quand un membre modifie un portefeuille partagé
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.wallets, public.wallet_members, public.transactions,
      public.ristournes, public.ristourne_members, public.ristourne_payments;
  end if;
end $$;
