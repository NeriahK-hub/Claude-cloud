-- Wallo : intérêts sur les dettes et prêts
-- À exécuter dans Supabase › SQL Editor après 20261007000000_shared_debts.sql.
--
-- • Un prêt (ou un emprunt) peut avoir des intérêts prévus : transactions.interest, dans la devise
--   de l'opération. Ils s'ajoutent à ce qu'il reste à rembourser, sans toucher au solde du portefeuille
--   (l'argent des intérêts arrive, ou part, avec les remboursements).
-- • Dette partagée : les intérêts sont un mouvement à part (kind = 'interest'), à confirmer par l'autre
--   comme tout le reste.

alter table public.transactions add column if not exists interest numeric check (interest >= 0);

alter table public.debt_moves drop constraint if exists debt_moves_kind_check;
alter table public.debt_moves add constraint debt_moves_kind_check check (kind in ('more', 'repay', 'interest'));
