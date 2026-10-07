-- Wallo : le Wrapped de l'année se pilote depuis l'espace admin (page Fonctionnalités)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run.
--
-- • wrapped          : allumé = calendrier automatique (compte à rebours du 15 au 30 novembre,
--                      carte « Voici ton année » du 1er décembre au 31 janvier) ; éteint = jamais de carte
-- • wrappedNow       : allumé = la carte du Wrapped apparaît tout de suite chez tout le monde (éteint au départ)
-- • wrappedCountdown : le compte à rebours de novembre (« 16 jours avant ton Wrapped »)

insert into public.app_features (key, label, description, enabled) values
  ('wrapped', 'Wrapped de l''année', 'Calendrier automatique : compte à rebours du 15 au 30 novembre, puis la carte « Voici ton année » sur l''accueil du 1er décembre au 31 janvier. Coupé : aucune carte Wrapped.', true),
  ('wrappedNow', 'Wrapped : montrer maintenant', 'Allumé : la carte du Wrapped apparaît tout de suite sur l''accueil de tout le monde, même hors décembre et janvier. À éteindre ensuite.', false),
  ('wrappedCountdown', 'Wrapped : compte à rebours', 'La carte « X jours avant ton Wrapped » du 15 au 30 novembre.', true)
on conflict (key) do nothing;
