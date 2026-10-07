-- Wallo : notifications push (même quand l'app est fermée)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run.
-- Ensuite : publier la fonction send-push et lancer supabase/push_cron.sql (voir supabase/README.md).
--
-- Principes
-- • Chaque appareil qui a activé les notifications s'abonne (push_subscriptions, une ligne par appareil).
-- • Ce qui doit prévenir quelqu'un (invitation, paiement à confirmer, opération dans un portefeuille
--   partagé, rappel de ristourne…) est mis dans une file d'attente (push_queue) par des déclencheurs.
-- • La fonction send-push (Edge Function) vide la file chaque minute et envoie aux appareils.
-- • On ne se prévient jamais soi-même, et seulement les comptes qui ont au moins un appareil abonné.
-- • Ni l'app ni les autres comptes ne lisent la file : seulement les fonctions de la base et send-push.

-- ---------------------------------------------------------------------------
-- Appareils abonnés
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique, -- adresse du service push du téléphone (Apple, Google, Mozilla…)
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_by_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "abonnements push : les miens" on public.push_subscriptions for select using (user_id = auth.uid());

-- Enregistre cet appareil pour le compte connecté. Un téléphone qui change de compte
-- ne garde que le dernier (security definer : l'ancienne ligne appartient à l'autre compte).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'Abonnement invalide';
  end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, updated_at = now();
end $$;

create or replace function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- File d'attente
-- ---------------------------------------------------------------------------

create table public.push_queue (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  tag text, -- même tag = une seule notification sur le téléphone (la plus récente)
  url text not null default '/',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index push_queue_waiting on public.push_queue (created_at) where sent_at is null;
alter table public.push_queue enable row level security; -- aucune règle : personne ne la lit depuis l'app

-- Ajoute une notification pour quelqu'un (jamais pour soi, seulement s'il a un appareil abonné)
create or replace function public.push_notify(p_user uuid, p_title text, p_body text, p_tag text default null, p_url text default '/')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = auth.uid() then
    return;
  end if;
  if not exists (select 1 from push_subscriptions where user_id = p_user) then
    return;
  end if;
  insert into push_queue (user_id, title, body, tag, url) values (p_user, left(p_title, 120), left(p_body, 300), p_tag, coalesce(p_url, '/'));
end $$;
revoke execute on function public.push_notify(uuid, text, text, text, text) from public, anon, authenticated;

-- Pour send-push : prend les notifications en attente (une seule fois chacune, même si deux envois tournent)
create or replace function public.claim_push_queue(p_limit integer default 500)
returns setof public.push_queue
language sql security definer set search_path = public as $$
  update push_queue set sent_at = now()
   where id in (
     select id from push_queue
      where sent_at is null and created_at > now() - interval '1 day'
      order by id
      limit p_limit
      for update skip locked
   )
  returning *;
$$;
revoke execute on function public.claim_push_queue(integer) from public, anon, authenticated;

-- Ménage : les notifications envoyées depuis plus de 7 jours
create or replace function public.push_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from push_queue where created_at < now() - interval '7 days';
$$;
revoke execute on function public.push_cleanup() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Annonces de l'espace admin : « envoyer aussi en notification » -> tous les appareils abonnés
-- (même tag que la notification affichée par l'app : jamais deux fois la même sur un téléphone)
-- ---------------------------------------------------------------------------

alter table public.announcements add column if not exists push boolean not null default false;

create or replace function public.push_on_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.push and new.active and (new.expires_at is null or new.expires_at > now())
     and (tg_op = 'INSERT' or not old.push) then
    insert into push_queue (user_id, title, body, tag)
    select distinct user_id, left(new.title, 120), left(new.message, 300), 'ann-' || new.id
      from push_subscriptions;
  end if;
  return null;
end $$;

create trigger announcements_push after insert or update of push on public.announcements
  for each row execute function public.push_on_announcement();

-- ---------------------------------------------------------------------------
-- Petits outils pour les textes
-- ---------------------------------------------------------------------------

-- 66000 CDF -> « 66.000,00 CDF » ; 30 USD -> « 30,00 $ » (comme dans l'app)
create or replace function public.push_money(n numeric, c text) returns text
language sql immutable as $$
  select translate(to_char(abs(n), 'FM999,999,999,990.00'), ',.', '.,')
         || ' ' || case upper(c) when 'USD' then '$' when 'EUR' then '€' else upper(c) end;
$$;

-- Adresse e-mail -> compte (pour prévenir une personne invitée qui a déjà un compte)
create or replace function public.push_user_by_email(mail text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(trim(mail)) limit 1;
$$;
revoke execute on function public.push_user_by_email(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Portefeuilles partagés
-- ---------------------------------------------------------------------------

-- Nouvelle opération : les autres membres sont prévenus (pas les vieilles opérations importées)
create or replace function public.push_on_transaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w record;
  m record;
  who text;
begin
  if new.deleted_at is not null or new.occurred_at < now() - interval '3 days' or new.type = 'adjustment' then
    return null;
  end if;
  select id, name into w from wallets where id = new.wallet_id;
  who := person_name(new.created_by);
  for m in
    select distinct user_id from wallet_members
     where wallet_id = new.wallet_id and status = 'active' and deleted_at is null
       and user_id is not null and user_id is distinct from new.created_by
  loop
    perform push_notify(
      m.user_id,
      w.name,
      who || ' : ' || case when new.amount < 0 then '−' else '+' end || push_money(new.amount, new.currency)
        || coalesce(' · ' || nullif(trim(new.title), ''), ''),
      'wallet-' || w.id
    );
  end loop;
  return null;
end $$;

create trigger transactions_push after insert on public.transactions
  for each row execute function public.push_on_transaction();

-- Invitation par e-mail (la personne a déjà un compte) / quelqu'un rejoint
create or replace function public.push_on_wallet_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w record;
begin
  select id, name, owner_id into w from wallets where id = new.wallet_id;
  if w.id is null or new.deleted_at is not null then
    return null;
  end if;
  if new.status = 'invited' and new.email is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'invited' or lower(old.email) is distinct from lower(new.email)) then
    perform push_notify(
      push_user_by_email(new.email),
      'Invitation : ' || w.name,
      person_name(w.owner_id) || ' t''invite à partager le portefeuille « ' || w.name || ' ». Ouvre Wallo pour le rejoindre.',
      'invite-wallet-' || w.id
    );
  elsif new.status = 'active' and new.role = 'member' and new.user_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'active' or old.user_id is distinct from new.user_id) then
    perform push_notify(w.owner_id, w.name, person_name(new.user_id) || ' a rejoint le portefeuille « ' || w.name || ' ».', 'wallet-' || w.id);
  end if;
  return null;
end $$;

create trigger wallet_members_push after insert or update on public.wallet_members
  for each row execute function public.push_on_wallet_member();

-- ---------------------------------------------------------------------------
-- Ristournes
-- ---------------------------------------------------------------------------

create or replace function public.push_on_ristourne_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  select id, name, owner_id, contribution, currency into r from ristournes where id = new.ristourne_id;
  if r.id is null or new.deleted_at is not null then
    return null;
  end if;
  if new.status = 'invited' and new.email is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'invited' or lower(old.email) is distinct from lower(new.email)) then
    perform push_notify(
      push_user_by_email(new.email),
      'Invitation : ' || r.name,
      person_name(r.owner_id) || ' t''ajoute à la ristourne « ' || r.name || ' » (' || push_money(r.contribution, r.currency)
        || ' par tour, tu reçois au tour ' || new.turn || '). Ouvre Wallo pour la voir.',
      'invite-ristourne-' || r.id
    );
  elsif new.status = 'active' and new.user_id is not null and new.user_id <> r.owner_id
     and (tg_op = 'INSERT' or old.status is distinct from 'active' or old.user_id is distinct from new.user_id) then
    perform push_notify(r.owner_id, r.name, person_name(new.user_id) || ' a rejoint la ristourne « ' || r.name || ' ».', 'ristourne-' || r.id);
  end if;
  return null;
end $$;

create trigger ristourne_members_push after insert or update on public.ristourne_members
  for each row execute function public.push_on_ristourne_member();

-- Paiement noté (à confirmer, ou noté pour quelqu'un) / paiement confirmé
create or replace function public.push_on_ristourne_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  m record;
  keeper uuid;
  amount text;
begin
  if new.deleted_at is not null then
    return null;
  end if;
  select id, name, owner_id, currency, keeper_member_id into r from ristournes where id = new.ristourne_id;
  select id, name, user_id into m from ristourne_members where id = new.member_id;
  if r.id is null or m.id is null then
    return null;
  end if;
  select user_id into keeper from ristourne_members where id = r.keeper_member_id;
  amount := push_money(new.amount, r.currency);
  if tg_op = 'INSERT' then
    if new.pending then
      -- Un membre dit avoir payé : l'organisateur et le gardien de l'argent confirment
      perform push_notify(r.owner_id, r.name, m.name || ' dit avoir payé ' || amount || ' (tour ' || new.turn || ') : à confirmer.', 'ristourne-pay-' || new.id);
      if keeper is distinct from r.owner_id then
        perform push_notify(keeper, r.name, m.name || ' dit avoir payé ' || amount || ' (tour ' || new.turn || ') : à confirmer.', 'ristourne-pay-' || new.id);
      end if;
    else
      perform push_notify(m.user_id, r.name, 'Ta cotisation de ' || amount || ' (tour ' || new.turn || ') est notée.', 'ristourne-pay-' || new.id);
    end if;
  elsif old.pending and not new.pending then
    perform push_notify(m.user_id, r.name, 'Ton paiement de ' || amount || ' (tour ' || new.turn || ') est confirmé.', 'ristourne-pay-' || new.id);
  end if;
  return null;
end $$;

create trigger ristourne_payments_push after insert or update on public.ristourne_payments
  for each row execute function public.push_on_ristourne_payment();

-- Date d'un tour (comme src/lib/ristourne.ts > turnDate)
create or replace function public.ristourne_turn_date(r public.ristournes, t integer) returns date
language sql immutable as $$
  select case r.frequency
    when 'monthly' then (r.start_date + make_interval(months => t - 1))::date
    when 'weekly' then r.start_date + (t - 1) * 7
    when 'biweekly' then r.start_date + (t - 1) * 14
    else r.start_date + (t - 1) * coalesce(r.every_days, 30)
  end;
$$;

-- Rappels du matin (lancé chaque jour par push_cron.sql) : tour demain ou aujourd'hui,
-- pour ceux qui n'ont pas encore payé, et pour la personne qui reçoit
create or replace function public.push_ristourne_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Africa/Kinshasa')::date;
  r public.ristournes;
  b record;
  m record;
  t integer;
  n integer;
  d date;
  sent integer := 0;
  paid numeric;
  label text;
begin
  for r in select * from ristournes where deleted_at is null loop
    select count(*) into n from ristourne_members where ristourne_id = r.id and status = 'active' and deleted_at is null;
    for t in 1 .. n loop
      d := ristourne_turn_date(r, t);
      continue when d not in (today, today + 1);
      label := case when d = today then 'Aujourd''hui' else 'Demain' end;
      select id, name, user_id into b from ristourne_members
       where ristourne_id = r.id and turn = t and status = 'active' and deleted_at is null limit 1;
      for m in
        select id, name, user_id from ristourne_members
         where ristourne_id = r.id and status = 'active' and deleted_at is null and user_id is not null
      loop
        if m.id = b.id then
          perform push_notify(m.user_id, r.name, label || ', c''est ton tour de recevoir la cagnotte (tour ' || t || ').', 'ristourne-turn-' || r.id || '-' || t);
          sent := sent + 1;
        else
          select coalesce(sum(amount), 0) into paid from ristourne_payments
           where ristourne_id = r.id and member_id = m.id and turn = t and deleted_at is null;
          if paid < r.contribution - 0.004 then
            perform push_notify(
              m.user_id, r.name,
              label || ' : ta cotisation de ' || push_money(r.contribution - paid, r.currency) || ' (tour ' || t
                || coalesce(', pour ' || b.name, '') || ').',
              'ristourne-turn-' || r.id || '-' || t
            );
            sent := sent + 1;
          end if;
        end if;
      end loop;
    end loop;
  end loop;
  return sent;
end $$;
revoke execute on function public.push_ristourne_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dettes et prêts partagés
-- ---------------------------------------------------------------------------

-- Nom que la personne prévenue donne à l'autre (son étiquette), sinon son nom de profil
create or replace function public.push_debt_other_name(s public.debt_shares, recipient uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when recipient = s.owner_id then coalesce(nullif(trim(s.owner_label), ''), person_name(s.guest_id))
    else coalesce(nullif(trim(s.guest_label), ''), person_name(s.owner_id))
  end;
$$;

create or replace function public.push_on_debt_move() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s public.debt_shares;
  other uuid;
  what text;
begin
  select * into s from debt_shares where id = new.share_id;
  if s.id is null or s.status <> 'active' then
    return null; -- pas encore acceptée : rien à prévenir
  end if;
  what := case new.kind when 'more' then 'un prêt' when 'repay' then 'un remboursement' else 'des intérêts' end
          || ' de ' || push_money(new.amount, new.currency);
  if tg_op = 'INSERT' and new.deleted_at is null then
    other := case when new.recorded_by = s.owner_id then s.guest_id else s.owner_id end;
    perform push_notify(other, 'Dettes et prêts', push_debt_other_name(s, other) || ' a noté ' || what || ' : à confirmer.', 'debt-' || s.id);
  elsif tg_op = 'UPDATE' then
    -- (accepter le lien confirme d'un coup ce qui était noté : la notification « a accepté » suffit)
    if old.pending and not new.pending and new.deleted_at is null and s.updated_at <> now() then
      perform push_notify(new.recorded_by, 'Dettes et prêts', push_debt_other_name(s, new.recorded_by) || ' a confirmé ' || what || '.', 'debt-' || s.id);
    elsif new.delete_requested_by is not null and old.delete_requested_by is null then
      other := case when new.delete_requested_by = s.owner_id then s.guest_id else s.owner_id end;
      perform push_notify(other, 'Dettes et prêts', push_debt_other_name(s, other) || ' veut supprimer ' || what || '.', 'debt-' || s.id);
    end if;
  end if;
  return null;
end $$;

create trigger debt_moves_push after insert or update on public.debt_moves
  for each row execute function public.push_on_debt_move();

-- La personne accepte (ou refuse) de suivre la dette
create or replace function public.push_on_debt_share() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'open' and new.status = 'active' then
    perform push_notify(new.owner_id, 'Dettes et prêts', push_debt_other_name(new, new.owner_id) || ' a accepté de suivre la dette avec toi.', 'debt-' || new.id);
  elsif old.status = 'open' and new.status = 'declined' then
    perform push_notify(new.owner_id, 'Dettes et prêts', push_debt_other_name(new, new.owner_id) || ' n''est pas d''accord avec le montant.', 'debt-' || new.id);
  end if;
  return null;
end $$;

create trigger debt_shares_push after update on public.debt_shares
  for each row execute function public.push_on_debt_share();
