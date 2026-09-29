-- Wallo : « Supprimer mon compte »
-- À exécuter dans Supabase › SQL Editor après 20260929000000_wallo_init.sql.
--
-- Ce qui disparaît : le compte, le profil, les catégories, budgets et icônes,
-- les portefeuilles et ristournes dont la personne est propriétaire (pour tous
-- leurs membres). Ce qui reste : les opérations qu'elle a ajoutées dans les
-- portefeuilles partagés des autres (sans auteur), et sa place dans les
-- ristournes des autres (le tour de rôle ne change pas).

-- L'auteur d'une opération / d'un versement peut devenir inconnu (compte supprimé)
alter table public.transactions alter column created_by drop not null;
alter table public.ristourne_payments alter column recorded_by drop not null;

-- Le garde-fou « l'auteur ne change pas » laisse passer l'effacement de l'auteur
-- quand son compte n'existe plus (ON DELETE SET NULL), et seulement dans ce cas.
create or replace function public.guard_transaction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is distinct from old.created_by
     and not (new.created_by is null and not exists (select 1 from auth.users where id = old.created_by)) then
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Connexion requise';
  end if;
  -- Quitter les portefeuilles partagés des autres (comme « Quitter »)
  update wallet_members set status = 'removed'
   where user_id = me and wallet_id not in (select id from wallets where owner_id = me);
  -- Le reste suit par ON DELETE CASCADE / SET NULL (dans les ristournes des
  -- autres, la personne reste membre par son nom, sans compte lié)
  delete from auth.users where id = me;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
