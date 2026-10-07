-- Tests : ristourne tous les N jours et invitation par lien
-- psql -v ON_ERROR_STOP=1 -f ristourne_invite_test.sql (après le stub, toutes les migrations et les autres tests)
\set org  'a1111111-1111-1111-1111-111111111111'
\set kemy 'a2222222-2222-2222-2222-222222222222'
\set neo  'a3333333-3333-3333-3333-333333333333'

insert into auth.users (id, email) values (:'org', 'org@test.cd'), (:'kemy', 'kemy@test.cd'), (:'neo', 'neo@test.cd');

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

set role authenticated;
select pg_temp.login(:'org', 'org@test.cd');
-- Tous les 3 jours
insert into ristournes (id, name, contribution, currency, frequency, every_days, start_date)
values ('bbbbbbbb-1111-0000-0000-000000000001', 'Tontine du marché', 10, 'USD', 'custom', 3, current_date);
select pg_temp.must_fail($$insert into ristournes (name, contribution, currency, frequency, start_date) values ('x', 5, 'USD', 'custom', current_date)$$, 'fréquence personnalisée sans nombre de jours');
select pg_temp.must_fail($$insert into ristournes (name, contribution, currency, frequency, every_days, start_date) values ('x', 5, 'USD', 'custom', 0, current_date)$$, 'tous les 0 jours');
insert into ristourne_members (id, ristourne_id, user_id, name, turn) values
  ('cccccccc-1111-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', :'org', 'Org', 1),
  ('cccccccc-1111-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000001', null, 'Kemy', 2);
create temp table t_code as select create_ristourne_invite('bbbbbbbb-1111-0000-0000-000000000001') ->> 'code' as code;
grant select on t_code to authenticated;
select pg_temp.check(length((select code from t_code)) = 8, 'l''organisateur crée un code');
select pg_temp.check((select create_ristourne_invite('bbbbbbbb-1111-0000-0000-000000000001') ->> 'code') = (select code from t_code), 'le même code est repris');
select pg_temp.check((ristourne_invite_check((select code from t_code)) ->> 'status') = 'owner', 'l''organisateur ne rejoint pas sa propre ristourne');

-- Kemy reprend sa place (tour 2)
select pg_temp.login(:'kemy', 'kemy@test.cd');
select pg_temp.must_fail($$select create_ristourne_invite('bbbbbbbb-1111-0000-0000-000000000001')$$, 'un non-organisateur crée un code');
select pg_temp.check(jsonb_array_length(ristourne_invite_check((select code from t_code)) -> 'slots') = 1, 'Kemy voit la place à son nom');
select pg_temp.check((join_ristourne((select code from t_code), 'Kemy M.', 'cccccccc-1111-0000-0000-000000000002') ->> 'status') = 'joined', 'Kemy rejoint en reprenant sa place');
select pg_temp.check((select count(*) from ristournes where id = 'bbbbbbbb-1111-0000-0000-000000000001') = 1, 'Kemy voit la ristourne');
select pg_temp.check((ristourne_invite_check((select code from t_code)) ->> 'status') = 'already', 'Kemy en fait déjà partie');
reset role;
select pg_temp.check((select user_id = :'kemy' and turn = 2 and name = 'Kemy' from ristourne_members where id = 'cccccccc-1111-0000-0000-000000000002'), 'la place de Kemy : son compte, son tour, son nom');

-- Néo n'est pas dans la liste : ajouté au dernier tour
set role authenticated;
select pg_temp.login(:'neo', 'neo@test.cd');
select pg_temp.check(jsonb_array_length(ristourne_invite_check((select code from t_code)) -> 'slots') = 0, 'plus aucune place libre');
select pg_temp.check((join_ristourne((select code from t_code), 'Néo', null) ->> 'status') = 'joined', 'Néo rejoint');
reset role;
select pg_temp.check((select turn from ristourne_members where user_id = :'neo') = 3, 'Néo est au tour 3');

-- Paiements à confirmer
set role authenticated;
select pg_temp.login(:'neo', 'neo@test.cd');
insert into ristourne_payments (id, ristourne_id, member_id, turn, amount, pending)
select 'dddddddd-1111-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', id, 1, 10, false from ristourne_members where user_id = :'neo';
reset role;
select pg_temp.check((select pending from ristourne_payments where id = 'dddddddd-1111-0000-0000-000000000001'), 'un membre note sa cotisation : à confirmer (même s''il dit le contraire)');
set role authenticated;
select pg_temp.login(:'neo', 'neo@test.cd');
update ristourne_payments set pending = false where id = 'dddddddd-1111-0000-0000-000000000001';
reset role;
select pg_temp.check((select pending from ristourne_payments where id = 'dddddddd-1111-0000-0000-000000000001'), 'un membre ne peut pas confirmer lui-même');
set role authenticated;
select pg_temp.login(:'org', 'org@test.cd');
update ristourne_payments set pending = false where id = 'dddddddd-1111-0000-0000-000000000001';
reset role;
select pg_temp.check(not (select pending from ristourne_payments where id = 'dddddddd-1111-0000-0000-000000000001'), 'l''organisateur confirme le paiement');
-- Kemy devient gardien de l'argent : il peut confirmer
set role authenticated;
select pg_temp.login(:'org', 'org@test.cd');
update ristournes set keeper_member_id = 'cccccccc-1111-0000-0000-000000000002', holding = 'digital', holding_details = 'M-Pesa 081 000 0000'
 where id = 'bbbbbbbb-1111-0000-0000-000000000001';
select pg_temp.login(:'neo', 'neo@test.cd');
insert into ristourne_payments (id, ristourne_id, member_id, turn, amount)
select 'dddddddd-1111-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000001', id, 2, 10 from ristourne_members where user_id = :'neo';
select pg_temp.login(:'kemy', 'kemy@test.cd');
update ristourne_payments set pending = false where id = 'dddddddd-1111-0000-0000-000000000002';
reset role;
select pg_temp.check(not (select pending from ristourne_payments where id = 'dddddddd-1111-0000-0000-000000000002'), 'le gardien de l''argent confirme un paiement');
select pg_temp.must_fail($$update ristournes set holding = 'coffre' where id = 'bbbbbbbb-1111-0000-0000-000000000001'$$, 'mode de garde inconnu');

-- Lien annulé
set role authenticated;
select pg_temp.login(:'org', 'org@test.cd');
select revoke_ristourne_invites('bbbbbbbb-1111-0000-0000-000000000001');
select pg_temp.login(:'neo', 'neo@test.cd');
select pg_temp.check((ristourne_invite_check((select code from t_code)) ->> 'status') = 'expired', 'lien annulé : expiré');
select pg_temp.check((ristourne_invite_check('ZZZZZZZZ') ->> 'status') = 'invalid', 'code inconnu');
reset role;
set role anon;
select pg_temp.must_fail($$select ristourne_invite_check('ZZZZZZZZ')$$, 'un visiteur non connecté vérifie un code');
reset role;
\echo '=== Ristourne : tous les tests sont passés ==='
