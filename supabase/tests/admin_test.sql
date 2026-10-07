-- Tests de l'espace admin : psql -v ON_ERROR_STOP=1 -f admin_test.sql
-- (après le stub, toutes les migrations et rls_test.sql)
\set admin '77777777-7777-7777-7777-777777777777'
\set erin  '88888888-8888-8888-8888-888888888888'
\set fred  '99999999-9999-9999-9999-999999999999'

insert into auth.users (id, email) values
  (:'admin', 'admin@test.cd'), (:'erin', 'erin@test.cd'), (:'fred', 'fred@test.cd');
insert into public.admins (user_id) values (:'admin');

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

-- ===== Visiteur non connecté : lit la config, rien d'autre =====
set role anon;
select pg_temp.check((app_config() -> 'features' ->> 'debts')::boolean, 'un visiteur lit les fonctionnalités');
select pg_temp.must_fail($$select * from app_features$$, 'un visiteur lit la table des fonctionnalités');
select pg_temp.must_fail($$select admin_stats()$$, 'un visiteur lit les statistiques');
select pg_temp.must_fail($$select * from admins$$, 'un visiteur lit la liste des admins');
reset role;

-- ===== Erin (utilisatrice normale) : aucun pouvoir =====
set role authenticated;
select pg_temp.login(:'erin', 'erin@test.cd');
select pg_temp.check(not is_admin(), 'Erin n''est pas admin');
select pg_temp.must_fail($$select admin_stats()$$, 'Erin lit les statistiques');
select pg_temp.must_fail($$select * from admin_list_users()$$, 'Erin liste les comptes');
select pg_temp.must_fail($$select admin_set_banned('99999999-9999-9999-9999-999999999999', true)$$, 'Erin bloque Fred');
select pg_temp.must_fail($$select admin_delete_user('99999999-9999-9999-9999-999999999999')$$, 'Erin supprime Fred');
select pg_temp.must_fail($$insert into admins (user_id) values ('88888888-8888-8888-8888-888888888888')$$, 'Erin se nomme admin');
select pg_temp.must_fail($$select * from admins$$, 'Erin lit la liste des admins');
update app_features set enabled = false where key = 'debts';
insert into wallets (id, name, currency) values ('aaaaaaaa-0000-0000-0000-0000000000e1', 'Cash Erin', 'CDF');
insert into transactions (wallet_id, title, occurred_at, amount, currency, type) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'Pain', now(), -2000, 'CDF', 'payment');
reset role;
select pg_temp.check((select enabled from app_features where key = 'debts'), 'Erin ne peut pas désactiver une fonctionnalité');
set role authenticated;
select pg_temp.login(:'erin', 'erin@test.cd');
select pg_temp.must_fail($$insert into announcements (title, message) values ('Pub', 'Spam')$$, 'Erin publie une annonce');
select pg_temp.must_fail($$insert into global_icons (name, data_url) values ('x', 'data:image/svg+xml,<svg/>')$$, 'Erin ajoute une icône pour tous');

-- ===== Admin =====
select pg_temp.login(:'admin', 'admin@test.cd');
select pg_temp.check(is_admin(), 'l''admin est reconnu');
select pg_temp.check((admin_stats() ->> 'users')::int >= 3, 'statistiques lisibles');
select pg_temp.check((admin_stats() ->> 'active_7d')::int >= 1, 'Erin compte parmi les actifs');
select pg_temp.check(jsonb_array_length(admin_stats() -> 'signups_by_day') = 30, 'inscriptions des 30 derniers jours');
select pg_temp.check((select transactions from admin_list_users('erin')) = 1, 'liste des comptes : nombre d''opérations d''Erin');
select pg_temp.check((select count(*) from admin_list_users('introuvable')) = 0, 'recherche sans résultat');
update app_features set enabled = false where key = 'debts';
select pg_temp.check(not (app_config() -> 'features' ->> 'debts')::boolean, 'l''admin désactive « Dettes et prêts »');
update app_features set enabled = true where key = 'debts';
insert into announcements (title, message) values ('Nouveauté', 'Les notes sont suggérées !');
insert into announcements (title, message, expires_at) values ('Vieille', 'Expirée', now() - interval '1 day');
insert into announcements (title, message, active) values ('Brouillon', 'Pas encore', false);
select pg_temp.check(jsonb_array_length(app_config() -> 'announcements') = 1, 'seules les annonces actives et non expirées sont envoyées');
insert into global_icons (name, data_url) values ('Wax', 'data:image/svg+xml;base64,PHN2Zy8+');
select pg_temp.check(jsonb_array_length(app_config() -> 'icons') = 1, 'icône pour tous publiée');
select pg_temp.must_fail($$insert into global_icons (name, data_url) values ('x', 'javascript:alert(1)')$$, 'icône qui n''est pas une image');
select pg_temp.must_fail($$select admin_set_banned('77777777-7777-7777-7777-777777777777', true)$$, 'l''admin se bloque lui-même');
select pg_temp.must_fail($$select admin_delete_user('77777777-7777-7777-7777-777777777777')$$, 'l''admin se supprime lui-même');
select admin_set_banned(:'fred', true);
select pg_temp.check((select banned from admin_list_users('fred')), 'Fred est bloqué');
select pg_temp.check((admin_stats() ->> 'banned')::int = 1, 'un compte bloqué dans les statistiques');
select admin_set_banned(:'fred', false);
select pg_temp.check(not (select banned from admin_list_users('fred')), 'Fred est débloqué');
select admin_delete_user(:'fred');
reset role;
select pg_temp.check(not exists (select 1 from auth.users where id = :'fred'), 'le compte de Fred est supprimé');

-- ===== Publicités =====
set role authenticated;
select pg_temp.login(:'admin', 'admin@test.cd');
insert into ads (id, title, image_url, link_url) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Magic Event', 'https://x.supabase.co/storage/v1/object/public/banners/a.webp', 'https://magic-event.cd');
insert into ads (title, image_url, starts_at) values ('Plus tard', 'https://x.supabase.co/b.webp', now() + interval '2 days');
insert into ads (title, image_url, active) values ('Arrêtée', 'https://x.supabase.co/c.webp', false);
select pg_temp.must_fail($$insert into ads (title, image_url, link_url) values ('x', 'https://x.cd/i.webp', 'javascript:alert(1)')$$, 'lien de pub qui n''est pas https');
select pg_temp.must_fail($$insert into ads (title, image_url) values ('x', 'http://x.cd/i.webp')$$, 'image de pub qui n''est pas https');
select pg_temp.check(jsonb_array_length(app_config() -> 'ads') = 1, 'seules les pubs en cours sont envoyées');
select pg_temp.login(:'erin', 'erin@test.cd');
select pg_temp.must_fail($$insert into ads (title, image_url) values ('Spam', 'https://x.cd/i.webp')$$, 'Erin crée une pub');
update ads set clicks = 1000 where true;
reset role;
select pg_temp.check((select clicks from ads where id = 'eeeeeeee-0000-0000-0000-000000000001') = 0, 'Erin ne peut pas truquer les clics');
set role anon;
select ad_event('eeeeeeee-0000-0000-0000-000000000001', 'view');
select ad_event('eeeeeeee-0000-0000-0000-000000000001', 'click');
select ad_event('eeeeeeee-0000-0000-0000-000000000001', 'autre');
reset role;
select pg_temp.check((select views = 1 and clicks = 1 from ads where id = 'eeeeeeee-0000-0000-0000-000000000001'), 'vue et clic comptés (sans compte)');

-- ===== Publicités par les fonctions « promo » =====
set role authenticated;
select pg_temp.login(:'erin', 'erin@test.cd');
select pg_temp.must_fail($$select * from admin_promos()$$, 'Erin liste les pubs par promo');
select pg_temp.must_fail($$select admin_promo_set_active('eeeeeeee-0000-0000-0000-000000000001', false)$$, 'Erin arrête une pub');
select pg_temp.login(:'admin', 'admin@test.cd');
select pg_temp.check((select count(*) from admin_promos()) = 3, 'l''admin liste les pubs (promo)');
select admin_promo_set_active('eeeeeeee-0000-0000-0000-000000000001', false);
select pg_temp.check(jsonb_array_length(app_config() -> 'ads') = 0, 'pub arrêtée : plus envoyée à l''app');
select admin_promo_set_active('eeeeeeee-0000-0000-0000-000000000001', true);
select pg_temp.check(admin_promo_create('Nouvelle', 'https://x.cd/n.webp', 'https://x.cd', true, null, null) is not null, 'l''admin crée une pub (promo)');
select pg_temp.check((select admin_promo_delete(id) from ads where title = 'Nouvelle') = 'https://x.cd/n.webp', 'l''admin supprime une pub et récupère son image');
reset role;
set role anon;
select promo_event('eeeeeeee-0000-0000-0000-000000000001', 'click');
reset role;
select pg_temp.check((select clicks = 2 from ads where id = 'eeeeeeee-0000-0000-0000-000000000001'), 'clic compté par promo_event (sans compte)');

-- ===== Visiteur : voit l'annonce et l'icône publiées =====
set role anon;
select pg_temp.check((app_config() -> 'announcements' -> 0 ->> 'title') = 'Nouveauté', 'un visiteur reçoit l''annonce');
reset role;
\echo '=== Admin : tous les tests sont passés ==='
