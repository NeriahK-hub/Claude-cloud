-- Wallo : cartes bancaires d'un portefeuille (nom, banque, reseau, 4 derniers chiffres, expiration)
-- A executer dans Supabase > SQL Editor apres 20261029000000_debt_refuse.sql.
--
-- Jamais le numero complet, le CVV ni le PIN : la base ne garde que les champs prevus et jette le
-- reste, meme si une appli (ou quelqu'un) en envoie davantage. L'appli ne l'envoie que si on s'en sert.

alter table public.wallets add column if not exists cards jsonb;

create or replace function public.clean_wallet_cards() returns trigger
language plpgsql set search_path = public as $$
declare
  c jsonb;
  kept jsonb := '[]'::jsonb;
  card jsonb;
begin
  if new.cards is null then
    return new;
  end if;
  if jsonb_typeof(new.cards) <> 'array' then
    new.cards := null;
    return new;
  end if;
  for c in select value from jsonb_array_elements(new.cards) loop
    exit when jsonb_array_length(kept) >= 10;
    continue when jsonb_typeof(c) <> 'object'
      or coalesce(c ->> 'last4', '') !~ '^[0-9]{4}$'
      or coalesce(c ->> 'expires', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$';
    card := jsonb_build_object(
      'id', left(coalesce(c ->> 'id', ''), 64),
      'label', regexp_replace(left(coalesce(c ->> 'label', ''), 40), '[0-9][0-9 -]{11,}[0-9]', '', 'g'),
      'network', case when c ->> 'network' in ('visa', 'mastercard') then c ->> 'network' else 'other' end,
      'last4', c ->> 'last4',
      'expires', c ->> 'expires');
    if coalesce(btrim(c ->> 'bank'), '') <> '' then
      card := card || jsonb_build_object('bank', regexp_replace(left(btrim(c ->> 'bank'), 40), '[0-9][0-9 -]{11,}[0-9]', '', 'g'));
    end if;
    kept := kept || jsonb_build_array(card);
  end loop;
  new.cards := kept;
  return new;
end $$;

drop trigger if exists wallets_clean_cards on public.wallets;
create trigger wallets_clean_cards before insert or update of cards on public.wallets
  for each row execute function public.clean_wallet_cards();
