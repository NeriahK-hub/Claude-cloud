-- Tests des règles d'accès : psql -v ON_ERROR_STOP=1 -f rls_test.sql (après le stub et la migration)
\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set carol '33333333-3333-3333-3333-333333333333'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alice', 'alice@test.cd', '{"full_name":"Alice"}'),
  (:'bob', 'Bob@Test.cd', '{}'),
  (:'carol', 'carol@test.cd', '{}');

-- Se connecter en tant que … (comme le ferait Supabase avec le jeton de l'utilisateur)
create function pg_temp.login(uid uuid, mail text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', mail)::text, false);
$$;

-- Test qui DOIT échouer (règle d'accès ou garde-fou)
create function pg_temp.must_fail(sql text, what text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'OK (refusé comme prévu) : %', what;
    return;
  end;
  raise exception 'ÉCHEC : aurait dû être refusé : %', what;
end $$;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'ÉCHEC : %', what; end if;
  raise notice 'OK : %', what;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- ===== Alice : ses données =====
set role authenticated;
select pg_temp.login(:'alice', 'alice@test.cd');
select pg_temp.check((select name from profiles) = 'Alice', 'profil créé à l''inscription avec le nom Google');
insert into wallets (id, name, currency) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Cash Alice', 'CDF');
insert into wallets (id, name, currency, kind, goal_amount) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Épargne couple', 'USD', 'goal', 2000);
select pg_temp.check((select count(*) from wallet_members where role = 'owner') = 2, 'Alice devient membre « owner » de ses portefeuilles');
insert into transactions (wallet_id, title, occurred_at, amount, currency, type) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Marché', now(), -5000, 'CDF', 'payment'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Versement Alice', now(), 100, 'USD', 'receive');
insert into categories (id, name, type) values ('food', 'Alimentation', 'expense');
insert into budgets (category_id, amount, currency) values ('food', 150000, 'CDF');
select pg_temp.must_fail($$insert into wallets (name, currency, owner_id) values ('Pirate', 'USD', '22222222-2222-2222-2222-222222222222')$$, 'créer un portefeuille au nom de quelqu''un d''autre');
select pg_temp.must_fail($$delete from transactions$$, 'suppression définitive (on utilise deleted_at)');

-- Alice invite Bob (par e-mail, casse différente) sur le portefeuille partagé + note « Maman » sans compte
insert into wallet_members (wallet_id, email, name, status) values ('aaaaaaaa-0000-0000-0000-000000000002', 'bob@test.cd', 'Bob', 'invited');
insert into wallet_members (wallet_id, name) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Maman');
select pg_temp.must_fail($$insert into wallet_members (wallet_id, name, role) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Faux', 'owner')$$, 'ajouter un second propriétaire');

-- ===== Bob : avant d'accepter =====
select pg_temp.login(:'bob', 'Bob@Test.cd');
select pg_temp.check((select count(*) from wallets) = 0, 'Bob ne voit aucun portefeuille avant d''accepter');
select pg_temp.check((select count(*) from transactions) = 0, 'Bob ne voit aucune transaction');
select pg_temp.check((select count(*) from wallet_members) = 1, 'Bob voit seulement son invitation');
select pg_temp.check((select count(*) from categories) = 0 and (select count(*) from budgets) = 0, 'catégories et budgets d''Alice invisibles pour Bob');
select pg_temp.must_fail($$insert into transactions (wallet_id, title, occurred_at, amount, currency, type) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Intrus', now(), 1, 'USD', 'receive')$$, 'écrire dans un portefeuille avant d''être membre');

-- ===== Bob accepte =====
select pg_temp.check(accept_invites() = 1, 'Bob accepte l''invitation');
select pg_temp.check((select count(*) from wallets) = 1, 'Bob voit le portefeuille partagé (et pas le Cash d''Alice)');
select pg_temp.check((select count(*) from transactions) = 1, 'Bob voit les transactions du partagé seulement');
select pg_temp.check((select count(*) from wallet_members) = 3, 'Bob voit les membres : Alice, lui, Maman');
insert into transactions (wallet_id, title, occurred_at, amount, currency, type) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Versement Bob', now(), 50, 'USD', 'receive');
update transactions set title = 'Versement Alice (corrigé)' where title = 'Versement Alice';
select pg_temp.check((select count(*) from transactions where title = 'Versement Alice (corrigé)') = 1, 'Bob peut corriger une opération du partagé');
update transactions set created_by = :'bob' where title = 'Versement Alice (corrigé)';
select pg_temp.check((select created_by from transactions where title = 'Versement Alice (corrigé)') = :'alice', 'l''auteur d''une opération ne change pas');
select pg_temp.must_fail($$insert into transactions (wallet_id, title, occurred_at, amount, currency, type) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Intrus', now(), 1, 'CDF', 'receive')$$, 'écrire dans le Cash privé d''Alice');
select pg_temp.must_fail($$update wallets set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000002'$$, 'un membre supprime le portefeuille');
select pg_temp.must_fail($$insert into wallet_members (wallet_id, email, name, status) values ('aaaaaaaa-0000-0000-0000-000000000002', 'x@x.cd', 'X', 'invited')$$, 'un membre invite quelqu''un');
update wallet_members set status = 'removed' where name = 'Maman';
select pg_temp.check((select status from wallet_members where name = 'Maman') = 'active', 'un membre ne peut pas retirer quelqu''un (modification ignorée)');
insert into categories (id, name, type) values ('food', 'Nourriture', 'expense');
select pg_temp.check((select name from categories where id = 'food') = 'Nourriture', 'Bob a sa propre catégorie « food », séparée de celle d''Alice');

-- ===== Carol : étrangère =====
select pg_temp.login(:'carol', 'carol@test.cd');
select pg_temp.check((select count(*) from wallets) + (select count(*) from transactions) + (select count(*) from wallet_members) = 0, 'Carol ne voit rien');
select pg_temp.check(accept_invites() = 0, 'Carol n''a aucune invitation');

-- ===== Alice : retire Bob, supprime (doucement) =====
select pg_temp.login(:'alice', 'alice@test.cd');
update wallet_members set status = 'removed' where user_id = :'bob';
select pg_temp.login(:'bob', 'Bob@Test.cd');
select pg_temp.check((select count(*) from wallets) = 0, 'Bob retiré ne voit plus le portefeuille');
select pg_temp.login(:'alice', 'alice@test.cd');
update wallets set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check((select deleted_at is not null from wallets where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'le propriétaire supprime (deleted_at rempli)');
select pg_temp.check((select updated_at > now() - interval '1 minute' from wallets where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'updated_at mis à jour par la base (synchro)');

-- ===== Carol est invitée sur le portefeuille partagé, puis le quitte =====
insert into wallets (id, name, currency) values ('aaaaaaaa-0000-0000-0000-000000000003', 'Vacances', 'USD');
insert into wallet_members (wallet_id, email, name, status) values ('aaaaaaaa-0000-0000-0000-000000000003', 'carol@test.cd', 'Carol', 'invited');
select pg_temp.login(:'carol', 'carol@test.cd');
select pg_temp.check(accept_invites() = 1, 'Carol accepte l''invitation à « Vacances »');
select pg_temp.check((select count(*) from wallets) = 1, 'Carol voit « Vacances »');
select leave_wallet('aaaaaaaa-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from wallets) = 0, 'Carol quitte « Vacances » et ne le voit plus');
select pg_temp.login(:'alice', 'alice@test.cd');
select leave_wallet('aaaaaaaa-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from wallets where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 1, 'la propriétaire ne peut pas « quitter » son propre portefeuille');

-- ===== Ristourne =====
insert into ristournes (id, name, contribution, currency, start_date) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Ristourne des amis', 50, 'USD', current_date);
insert into ristourne_members (id, ristourne_id, name, turn) values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Alice', 1);
insert into ristourne_members (id, ristourne_id, name, turn, email, status) values ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Carol', 2, 'carol@test.cd', 'invited');
select pg_temp.login(:'carol', 'carol@test.cd');
select pg_temp.check(accept_invites() = 1, 'Carol rejoint la ristourne');
select pg_temp.check((select count(*) from ristourne_members) = 2, 'Carol voit les membres de la ristourne');
insert into ristourne_payments (ristourne_id, member_id, turn, amount) values ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 1, 50);
update ristournes set contribution = 1;
select pg_temp.check((select contribution from ristournes) = 50, 'un membre ne peut pas changer la cotisation (modification ignorée)');
select pg_temp.login(:'bob', 'Bob@Test.cd');
select pg_temp.check((select count(*) from ristournes) + (select count(*) from ristourne_payments) = 0, 'Bob ne voit pas la ristourne');
select pg_temp.login(:'carol', 'carol@test.cd');
select leave_ristourne('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from ristournes) = 0, 'Carol quitte la ristourne et ne la voit plus');

-- ===== Invitation par lien / code =====
\set dave '44444444-4444-4444-4444-444444444444'
reset role;
insert into auth.users (id, email) values (:'dave', 'dave@test.cd');
grant execute on all functions in schema pg_temp to authenticated, anon;
set role authenticated;

select pg_temp.login(:'alice', 'alice@test.cd');
insert into wallets (id, name, currency) values ('aaaaaaaa-0000-0000-0000-0000000000b1', 'Maison', 'USD');
select create_wallet_invite('aaaaaaaa-0000-0000-0000-0000000000b1') ->> 'code' as c1 \gset
select pg_temp.check(:'c1' ~ '^[A-HJKMNP-Z2-9]{8}$', 'code de 8 caractères sans 0/O/1/I/L');
select pg_temp.check((create_wallet_invite('aaaaaaaa-0000-0000-0000-0000000000b1') ->> 'code') = :'c1', 'le même code est repris tant qu''il est valable');
select pg_temp.check(wallet_invite_check(:'c1') ->> 'status' = 'owner', 'la propriétaire ouvre son propre lien : « owner »');

select pg_temp.login(:'dave', 'dave@test.cd');
select pg_temp.must_fail($$select create_wallet_invite('aaaaaaaa-0000-0000-0000-0000000000b1')$$, 'un non-propriétaire crée un lien');
select pg_temp.must_fail($$select person_name('11111111-1111-1111-1111-111111111111')$$, 'lire le nom (ou l''e-mail) de n''importe qui');
select pg_temp.must_fail($$select * from wallet_invites$$, 'lire la table des codes directement');
select pg_temp.check((select count(*) from wallets) = 0, 'Dave ne voit rien avant de rejoindre');
select pg_temp.check(wallet_invite_check(lower(substr(:'c1', 1, 4)) || '-' || lower(substr(:'c1', 5))) ->> 'status' = 'ok', 'le code marche en minuscules et avec un tiret');
select pg_temp.check((wallet_invite_check(:'c1') ->> 'owner_name') = 'Alice' and (wallet_invite_check(:'c1') ->> 'wallet_name') = 'Maison', 'aperçu : « Alice t''invite à rejoindre Maison »');
select pg_temp.check(join_wallet(:'c1', ' Dave ') ->> 'status' = 'joined', 'Dave rejoint avec le code');
select pg_temp.check((select count(*) from wallets) = 1, 'Dave voit « Maison »');
select pg_temp.check((select name from wallet_members where user_id = :'dave') = 'Dave', 'son prénom est enregistré (sans espaces)');
select pg_temp.check((select name from profiles where id = :'dave') = 'Dave', 'son profil vide prend ce prénom');
select pg_temp.check(join_wallet(:'c1') ->> 'status' = 'already', 'rejoindre deux fois : « already »');
insert into transactions (wallet_id, title, occurred_at, amount, currency, type) values ('aaaaaaaa-0000-0000-0000-0000000000b1', 'Loyer', now(), -300, 'USD', 'payment');
select pg_temp.check((select count(*) from transactions where title = 'Loyer') = 1, 'Dave ajoute une opération dans « Maison »');

-- Retiré par la propriétaire : le lien est annulé, il ne peut pas revenir avec
select pg_temp.login(:'alice', 'alice@test.cd');
update wallet_members set status = 'removed' where user_id = :'dave';
select pg_temp.login(:'dave', 'dave@test.cd');
select pg_temp.check((select count(*) from wallets) = 0, 'Dave retiré ne voit plus « Maison »');
select pg_temp.check(join_wallet(:'c1') ->> 'status' = 'expired', 'l''ancien lien est annulé quand on retire quelqu''un');
select pg_temp.login(:'alice', 'alice@test.cd');
select create_wallet_invite('aaaaaaaa-0000-0000-0000-0000000000b1') ->> 'code' as c2 \gset
select pg_temp.check(:'c2' <> :'c1', 'un nouveau lien a un nouveau code');
select pg_temp.login(:'dave', 'dave@test.cd');
select pg_temp.check(join_wallet(:'c2', 'Dave') ->> 'status' = 'joined', 'réinvité, Dave revient');
select pg_temp.check((select count(*) from wallet_members where user_id = :'dave') = 1, 'il reprend sa place (pas de doublon)');
-- Il quitte de lui-même : le lien reste valable pour les autres
select leave_wallet('aaaaaaaa-0000-0000-0000-0000000000b1');
select pg_temp.check(wallet_invite_check(:'c2') ->> 'status' = 'ok', 'quitter soi-même n''annule pas le lien');

-- Annuler le lien à la main
select pg_temp.login(:'alice', 'alice@test.cd');
select revoke_wallet_invites('aaaaaaaa-0000-0000-0000-0000000000b1');
select pg_temp.login(:'dave', 'dave@test.cd');
select pg_temp.check(wallet_invite_check(:'c2') ->> 'status' = 'expired', 'lien annulé par la propriétaire');
select pg_temp.must_fail($$select revoke_wallet_invites('aaaaaaaa-0000-0000-0000-0000000000b1')$$, 'un non-propriétaire annule un lien');

-- Lien expiré (plus de 7 jours)
select pg_temp.login(:'alice', 'alice@test.cd');
select create_wallet_invite('aaaaaaaa-0000-0000-0000-0000000000b1') ->> 'code' as c3 \gset
reset role;
update wallet_invites set expires_at = now() - interval '1 minute' where code = :'c3';
set role authenticated;
select pg_temp.login(:'dave', 'dave@test.cd');
select pg_temp.check(join_wallet(:'c3') ->> 'status' = 'expired', 'lien expiré refusé');

-- Propriétaire noté « Moi » (pas de nom de profil) : les membres voient son vrai nom
select pg_temp.login(:'carol', 'carol@test.cd');
insert into wallets (id, name, currency) values ('aaaaaaaa-0000-0000-0000-0000000000b2', 'Colocation', 'CDF');
select create_wallet_invite('aaaaaaaa-0000-0000-0000-0000000000b2') ->> 'code' as c4 \gset
select pg_temp.login(:'dave', 'dave@test.cd');
select pg_temp.check(wallet_invite_check(:'c4') ->> 'owner_name' = 'carol', 'sans nom de profil, on affiche le début de l''e-mail');
select pg_temp.check(join_wallet(:'c4') ->> 'status' = 'joined', 'Dave rejoint « Colocation »');
select pg_temp.check((select name from wallet_members where wallet_id = 'aaaaaaaa-0000-0000-0000-0000000000b2' and role = 'owner') = 'carol', 'la propriétaire n''apparaît plus comme « Moi »');

-- Deviner des codes : bloqué après 20 essais faux en une heure
select pg_temp.login(:'bob', 'Bob@Test.cd');
select pg_temp.check(wallet_invite_check('ZZZZZZZZ') ->> 'status' = 'invalid', 'code inconnu : « invalid »');
select count(*) from (select wallet_invite_check('ZZZZZZZ' || i) from generate_series(1, 19) i) x \gset
select pg_temp.check(wallet_invite_check(:'c4') ->> 'status' = 'blocked', 'après 20 codes faux, même un bon code est bloqué');
select pg_temp.check(join_wallet(:'c4') ->> 'status' = 'blocked', 'et on ne peut pas rejoindre');

set role anon;
select pg_temp.must_fail($$select wallet_invite_check('ABCDEFGH')$$, 'un visiteur non connecté teste un code');
set role authenticated;

-- ===== Supprimer son compte =====
-- Bob : son portefeuille, une opération dans « Courses » d'Alice, un versement dans la ristourne d'Alice
select pg_temp.login(:'alice', 'alice@test.cd');
insert into wallets (id, name, currency) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Courses', 'USD');
insert into wallet_members (wallet_id, name, email, status) values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Bob', 'bob@test.cd', 'invited');
insert into ristourne_members (id, ristourne_id, name, turn, email, status) values ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'Bob', 3, 'bob@test.cd', 'invited');
select pg_temp.login(:'bob', 'Bob@Test.cd');
select pg_temp.check(accept_invites() = 2, 'Bob rejoint « Courses » et la ristourne');
insert into wallets (id, name, currency) values ('aaaaaaaa-0000-0000-0000-000000000009', 'Cash Bob', 'USD');
insert into transactions (id, wallet_id, title, occurred_at, amount, currency, type) values
  ('dddddddd-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000009', 'Pain', now(), -2, 'USD', 'payment'),
  ('dddddddd-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Essence', now(), -40, 'USD', 'payment');
insert into ristourne_payments (ristourne_id, member_id, turn, amount) values ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 1, 50);
update transactions set created_by = null where id = 'dddddddd-0000-0000-0000-000000000010';
select pg_temp.check((select created_by from transactions where id = 'dddddddd-0000-0000-0000-000000000010') = :'bob', 'on ne peut pas effacer l''auteur d''une opération');
set role anon;
select pg_temp.must_fail($$select delete_my_account()$$, 'un visiteur non connecté supprime un compte');
set role authenticated;
select delete_my_account();
reset role;
select pg_temp.check(not exists (select 1 from auth.users where id = :'bob'), 'le compte de Bob est supprimé');
select pg_temp.check(not exists (select 1 from wallets where id = 'aaaaaaaa-0000-0000-0000-000000000009'), 'son portefeuille est supprimé');
select pg_temp.check(not exists (select 1 from transactions where id = 'dddddddd-0000-0000-0000-000000000009'), 'ses opérations dans son portefeuille sont supprimées');
select pg_temp.check(not exists (select 1 from categories where user_id = :'bob') and not exists (select 1 from profiles where id = :'bob'), 'ses catégories et son profil sont supprimés');
select pg_temp.check((select created_by from transactions where id = 'dddddddd-0000-0000-0000-000000000010') is null, 'son opération dans « Courses » reste, sans auteur');
select pg_temp.check((select status from wallet_members where email = 'bob@test.cd' and wallet_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') = 'removed', 'il a quitté « Courses »');
select pg_temp.check((select user_id from ristourne_members where id = 'cccccccc-0000-0000-0000-000000000003') is null
  and (select count(*) from ristourne_payments where member_id = 'cccccccc-0000-0000-0000-000000000003') = 1, 'sa place et son versement dans la ristourne restent');
select pg_temp.check((select count(*) from wallets where id = 'aaaaaaaa-0000-0000-0000-0000000000a1') = 1, '« Courses » d''Alice existe toujours');
set role authenticated;

-- ===== Visiteur non connecté =====
reset role;
set role anon;
select pg_temp.must_fail($$select * from wallets$$, 'un visiteur non connecté lit les portefeuilles');
reset role;
\echo '=== Tous les tests sont passés ==='
