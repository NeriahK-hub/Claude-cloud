-- Tests : cartes bancaires d'un portefeuille (seulement les champs prévus, jamais un numéro complet)
-- psql -v ON_ERROR_STOP=1 -f wallet_cards_test.sql (après le stub et toutes les migrations, dans sa propre session)
\set kim 'c1111111-1111-1111-1111-111111111111'
\set w   'cccccccc-0000-0000-0000-000000000001'

insert into auth.users (id, email) values (:'kim', 'kim@test.cd');
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'ÉCHEC : %', what; end if;
  raise notice 'OK : %', what;
end $$;
grant execute on all functions in schema pg_temp to authenticated;
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'kim', 'email', 'kim@test.cd')::text, false);

insert into wallets (id, name, currency) values (:'w', 'Rawbank', 'USD');
select pg_temp.check((select cards is null from wallets where id = :'w'), 'sans carte : colonne vide');

update wallets set cards = '[{"id":"c1","label":"Visa Rawbank","bank":"Rawbank","network":"visa","last4":"4821","expires":"2028-08"}]' where id = :'w';
select pg_temp.check((select cards = '[{"id":"c1","label":"Visa Rawbank","bank":"Rawbank","network":"visa","last4":"4821","expires":"2028-08"}]'::jsonb from wallets where id = :'w'),
  'une carte normale est gardée telle quelle');

update wallets set cards = '[{"id":"c1","label":"Visa","network":"visa","last4":"4821","expires":"2028-08","number":"4111111111114821","cvv":"123","pin":"0000"}]' where id = :'w';
select pg_temp.check((select not (cards -> 0 ? 'number') and not (cards -> 0 ? 'cvv') and not (cards -> 0 ? 'pin') from wallets where id = :'w'),
  'numéro complet, CVV et PIN sont jetés par la base');

update wallets set cards = '[{"id":"c1","label":"Ma carte 4111 1111 1111 4821","network":"visa","last4":"4821","expires":"2028-08"}]' where id = :'w';
select pg_temp.check((select cards -> 0 ->> 'label' !~ '[0-9]{4} [0-9]{4} [0-9]{4}' from wallets where id = :'w'), 'un numéro complet caché dans le nom est effacé');

update wallets set cards = '[{"id":"a","last4":"12345","expires":"2028-08"},{"id":"b","last4":"1234","expires":"2028-13"},{"id":"c","last4":"9999","expires":"2030-01","network":"amex"}]' where id = :'w';
select pg_temp.check((select jsonb_array_length(cards) = 1 and cards -> 0 ->> 'id' = 'c' and cards -> 0 ->> 'network' = 'other' from wallets where id = :'w'),
  'cartes mal formées jetées, réseau inconnu -> other');

update wallets set cards = (select jsonb_agg(jsonb_build_object('id', i::text, 'last4', '1234', 'expires', '2029-01')) from generate_series(1, 15) i) where id = :'w';
select pg_temp.check((select jsonb_array_length(cards) = 10 from wallets where id = :'w'), '10 cartes au plus');

update wallets set cards = '{"pas":"une liste"}' where id = :'w';
select pg_temp.check((select cards is null from wallets where id = :'w'), 'autre chose qu''une liste : vidé');

update wallets set name = 'Rawbank USD' where id = :'w';
select pg_temp.check((select name = 'Rawbank USD' from wallets where id = :'w'), 'le reste du portefeuille se modifie comme avant');
reset role;

\echo '=== Cartes bancaires : tous les tests sont passés ==='
