-- Wallo : plus de suppression définitive par l'API, tout passe par deleted_at
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run
-- (après 20261018000000_scale.sql).
--
-- Supabase ouvre par défaut toutes les tables de « public » à anon et authenticated (ALL, donc DELETE
-- et TRUNCATE). La migration de départ n'avait retiré que les droits d'anon sur les tables de l'époque.
-- Résultat :
--  - catégories, budgets, icônes (règles « for all ») : une vraie suppression était possible ; les
--    autres appareils ne la voyaient jamais (la synchro ne lit que deleted_at) ;
--  - opérations, portefeuilles… : un DELETE passait sans erreur (0 ligne, faute de règle) ;
--  - TRUNCATE ne passe pas par les règles RLS ;
--  - anon gardait tous les droits sur les tables créées après la migration de départ.
-- Les suppressions se font par « update … set deleted_at = now() » (src/lib/sync/supabaseRemote.ts)
-- ou par des fonctions security definer (delete_my_account, admin_*) : rien ne change pour l'app.

-- Visiteurs (anon) : rien sur les tables, comme prévu dès le départ (ils passent par des fonctions)
revoke all on all tables in schema public from anon;

-- Comptes connectés : ni DELETE ni TRUNCATE
revoke delete, truncate on all tables in schema public from authenticated;

-- Sauf l'espace admin, qui supprime vraiment annonces, icônes globales et pubs (règles « admin » seulement)
grant delete on public.announcements, public.global_icons, public.ads to authenticated;

-- Tables créées plus tard par les migrations : mêmes droits d'office
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke delete, truncate on tables from authenticated;
