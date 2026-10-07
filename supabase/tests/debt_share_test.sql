-- Tests : dettes et prêts partagés (invitation, confirmation, suppression, départ)
-- psql -v ON_ERROR_STOP=1 -f debt_share_test.sql (après le stub et toutes les migrations, dans sa propre session)
\set nk   'd1111111-1111-1111-1111-111111111111'
\set dm   'd2222222-2222-2222-2222-222222222222'
\set zoe  'd3333333-3333-3333-3333-333333333333'
\set sh   'dddddddd-0000-0000-0000-000000000001'
\set m1   'eeeeeeee-0000-0000-0000-000000000001'
\set m2   'eeeeeeee-0000-0000-0000-000000000002'
\set m3   'eeeeeeee-0000-0000-0000-000000000003'
\set m4   'eeeeeeee-0000-0000-0000-000000000004'
\set m5   'eeeeeeee-0000-0000-0000-000000000005'

insert into auth.users (id, email) values (:'nk', 'nk@test.cd'), (:'dm', 'dm@test.cd'), (:'zoe', 'zoe@test.cd');
update profiles set name = 'Neriah' where id = :'nk';

create function pg_temp.login(uid uuid, mail text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', mail)::text, false);
$$;
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
create temp table t_code (code text);
grant select, insert, delete on t_code to authenticated;

set role authenticated;

-- ---------- Neriah partage : DM fablab lui doit ----------
select pg_temp.login(:'nk', 'nk@test.cd');
insert into debt_shares (id, owner_side, owner_label) values (:'sh', 'receivable', 'DM fablab');
insert into debt_moves (id, share_id, kind, amount, currency, pending) values
  (:'m1', :'sh', 'more', 165000, 'CDF', false),
  (:'m2', :'sh', 'repay', 44000, 'CDF', false);
select pg_temp.check((select bool_and(pending) from debt_moves where share_id = :'sh'), 'un mouvement noté est toujours « à confirmer »');
select pg_temp.must_fail($$insert into debt_shares (owner_side, owner_label, status) values ('payable', 'x', 'active')$$, 'créer une dette déjà « active »');
insert into t_code select create_debt_invite(:'sh') ->> 'code';

-- ---------- Une inconnue ne voit rien ----------
select pg_temp.login(:'zoe', 'zoe@test.cd');
select pg_temp.check((select count(*) from debt_shares) = 0 and (select count(*) from debt_moves) = 0, 'une inconnue ne voit ni la dette ni ses mouvements');
select pg_temp.must_fail(format($$insert into debt_moves (share_id, kind, amount, currency) values (%L, 'repay', 1, 'CDF')$$, :'sh'), 'une inconnue note un mouvement');
select pg_temp.must_fail(format($$select create_debt_invite(%L)$$, :'sh'), 'une inconnue crée un lien');

-- ---------- DM ouvre le lien ----------
select pg_temp.login(:'dm', 'dm@test.cd');
select pg_temp.check((select debt_invite_check((select code from t_code)) ->> 'status') = 'ok', 'le code est valable');
select pg_temp.check((select debt_invite_check((select code from t_code)) ->> 'guest_side') = 'payable', 'DM voit qu''il doit (côté inverse)');
select pg_temp.check((select jsonb_array_length(debt_invite_check((select code from t_code)) -> 'moves')) = 2, 'DM voit l''historique avant d''accepter');
select pg_temp.check((select debt_invite_check((select code from t_code)) ->> 'owner_name') = 'Neriah', 'DM voit le nom de Neriah');
select pg_temp.check((select join_debt((select code from t_code), 'Neriah K.') ->> 'status') = 'joined', 'DM accepte');
select pg_temp.check((select status from debt_shares where id = :'sh') = 'active', 'la dette est partagée');
select pg_temp.check((select guest_label from debt_shares where id = :'sh') = 'Neriah K.', 'DM a choisi le nom de Neriah chez lui');
select pg_temp.check((select not bool_or(pending) from debt_moves where share_id = :'sh'), 'accepter confirme ce qui était déjà noté');
select pg_temp.check((select debt_invite_check((select code from t_code)) ->> 'status') = 'expired', 'le lien ne sert qu''une fois');

-- DM ne modifie pas la dette elle-même
update debt_shares set owner_label = 'Piraté', owner_side = 'payable' where id = :'sh';
select pg_temp.login(:'nk', 'nk@test.cd');
select pg_temp.check((select owner_label = 'DM fablab' and owner_side = 'receivable' from debt_shares where id = :'sh'), 'DM ne change ni le nom ni le sens de la dette');
-- Neriah ne change plus le sens une fois acceptée, mais peut renommer
update debt_shares set owner_side = 'payable', owner_label = 'DM', status = 'declined' where id = :'sh';
select pg_temp.check((select owner_side = 'receivable' and owner_label = 'DM' and status = 'active' from debt_shares where id = :'sh'), 'après acceptation : renommer oui, changer le sens ou le statut non');

-- ---------- DM rembourse 20.000 : Neriah confirme ----------
select pg_temp.login(:'dm', 'dm@test.cd');
insert into debt_moves (id, share_id, kind, amount, currency, pending, guest_tx_id, owner_tx_id)
values (:'m3', :'sh', 'repay', 20000, 'CDF', false, 'tx-dm-airtel', 'tx-pirate');
select pg_temp.check((select pending from debt_moves where id = :'m3'), 'le remboursement noté par DM attend la confirmation');
select pg_temp.check((select guest_tx_id = 'tx-dm-airtel' and owner_tx_id is null from debt_moves where id = :'m3'), 'DM ne relie que sa propre opération');
update debt_moves set pending = false where id = :'m3';
select pg_temp.check((select pending from debt_moves where id = :'m3'), 'DM ne confirme pas son propre mouvement');

select pg_temp.login(:'nk', 'nk@test.cd');
-- Comme la synchro : « insert … on conflict do update » avec la ligne entière
insert into debt_moves (id, share_id, kind, amount, currency, pending, owner_tx_id, guest_tx_id)
values (:'m3', :'sh', 'repay', 20000, 'CDF', false, 'tx-nk-cash', 'x')
on conflict (id) do update set pending = excluded.pending, owner_tx_id = excluded.owner_tx_id, guest_tx_id = excluded.guest_tx_id;
select pg_temp.check((select not pending and owner_tx_id = 'tx-nk-cash' and guest_tx_id = 'tx-dm-airtel' from debt_moves where id = :'m3'), 'Neriah confirme (par la synchro) et relie son entrée en Cash');
update debt_moves set pending = true where id = :'m3';
select pg_temp.check((select not pending from debt_moves where id = :'m3'), 'on ne « dé-confirme » pas');

-- ---------- Un mouvement confirmé ne bouge plus seul ----------
update debt_moves set amount = 1, kind = 'more' where id = :'m1';
select pg_temp.check((select amount = 165000 and kind = 'more' from debt_moves where id = :'m1'), 'montant d''un mouvement confirmé : inchangé');
update debt_moves set deleted_at = now() where id = :'m1';
select pg_temp.check((select deleted_at is null from debt_moves where id = :'m1'), 'supprimer seul un mouvement confirmé : ignoré');

-- Neriah demande la suppression de m2 ; il ne peut pas l'accepter lui-même ; DM accepte
update debt_moves set delete_requested_by = :'nk' where id = :'m2';
update debt_moves set deleted_at = now() where id = :'m2';
select pg_temp.check((select delete_requested_by = :'nk' and deleted_at is null from debt_moves where id = :'m2'), 'on n''accepte pas sa propre demande de suppression');
select pg_temp.login(:'dm', 'dm@test.cd');
update debt_moves set delete_requested_by = :'dm' where id = :'m1';
select pg_temp.check((select delete_requested_by = :'dm' from debt_moves where id = :'m1'), 'DM peut aussi demander une suppression');
update debt_moves set delete_requested_by = null where id = :'m1';
update debt_moves set delete_requested_by = :'nk' where id = :'m1';
select pg_temp.check((select delete_requested_by is null from debt_moves where id = :'m1'), 'on ne demande pas au nom de l''autre');
update debt_moves set deleted_at = now() where id = :'m2';
select pg_temp.check((select deleted_at is not null from debt_moves where id = :'m2'), 'DM accepte la suppression demandée par Neriah');
update debt_moves set deleted_at = null where id = :'m2';
select pg_temp.check((select deleted_at is not null from debt_moves where id = :'m2'), 'un mouvement supprimé ne revient pas');

-- ---------- Mouvement en attente : l'autre peut le refuser ----------
insert into debt_moves (id, share_id, kind, amount, currency) values (:'m4', :'sh', 'repay', 5000, 'CDF');
select pg_temp.login(:'nk', 'nk@test.cd');
update debt_moves set deleted_at = now() where id = :'m4';
select pg_temp.check((select deleted_at is not null from debt_moves where id = :'m4'), 'Neriah refuse un remboursement pas reçu');

-- ---------- DM arrête de suivre la dette ----------
select pg_temp.login(:'dm', 'dm@test.cd');
select leave_debt_share(:'sh');
select pg_temp.check((select count(*) from debt_shares) = 0 and (select count(*) from debt_moves) = 0, 'DM ne voit plus la dette');
select pg_temp.must_fail(format($$insert into debt_moves (share_id, kind, amount, currency) values (%L, 'repay', 1, 'CDF')$$, :'sh'), 'DM note un mouvement après être parti');

select pg_temp.login(:'nk', 'nk@test.cd');
select pg_temp.check((select guest_left_at is not null from debt_shares where id = :'sh'), 'Neriah voit que DM ne suit plus');
select pg_temp.check((select count(*) from debt_moves where share_id = :'sh' and deleted_at is null) = 2, 'chez Neriah, tout l''historique reste');
update debt_moves set amount = 160000 where id = :'m1';
update debt_moves set deleted_at = now() where id = :'m3';
select pg_temp.check((select amount from debt_moves where id = :'m1') = 160000 and (select deleted_at is not null from debt_moves where id = :'m3'), 'seul à suivre : Neriah corrige librement');

-- ---------- Nouveau lien : Zoé n'est pas d'accord ----------
delete from t_code;
insert into t_code select create_debt_invite(:'sh') ->> 'code';
select pg_temp.check((select status = 'open' and guest_id is null from debt_shares where id = :'sh'), 'un nouveau lien remet la dette en attente');
select pg_temp.login(:'zoe', 'zoe@test.cd');
select pg_temp.check((select decline_debt((select code from t_code)) ->> 'status') = 'declined', 'Zoé refuse le montant');
select pg_temp.check((select count(*) from debt_shares) = 0, 'après un refus, Zoé ne voit pas la dette');
select pg_temp.login(:'nk', 'nk@test.cd');
select pg_temp.check((select status from debt_shares where id = :'sh') = 'declined', 'Neriah voit le refus');

-- Pas encore acceptée : Neriah corrige et note librement
insert into debt_moves (id, share_id, kind, amount, currency) values (:'m5', :'sh', 'more', 1000, 'CDF');
update debt_moves set amount = 2000 where id = :'m5';
select pg_temp.check((select amount from debt_moves where id = :'m5') = 2000, 'pas encore partagée : Neriah corrige son mouvement');

-- ---------- Neriah arrête de suivre ----------
select leave_debt_share(:'sh');
select pg_temp.check((select count(*) from debt_shares) = 0, 'Neriah ne voit plus la dette');
select pg_temp.check((select debt_invite_check((select code from t_code)) ->> 'status') = 'expired', 'ses liens sont annulés');

reset role;
set role anon;
select pg_temp.must_fail($$select * from debt_shares$$, 'un visiteur non connecté lit les dettes');
reset role;

\echo '=== Dettes partagées : tous les tests sont passés ==='
