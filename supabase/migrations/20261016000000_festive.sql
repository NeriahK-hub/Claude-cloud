-- Wallo : design des fêtes de fin d'année, à allumer depuis l'espace admin (page Fonctionnalités)
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller ce fichier > Run.
-- Allumé : Noël jusqu'au 26 décembre (neige, carte « Joyeux Noël »), puis Nouvel an (paillettes dorées,
-- carte « Bonne année »). Chaque personne peut couper les décorations dans Paramètres › Apparence.

insert into public.app_features (key, label, description, enabled) values
  ('festive', 'Design des fêtes', 'Noël (neige, couleurs rouge et vert) jusqu''au 26 décembre, puis Nouvel an (or, paillettes). Pour tout le monde, à éteindre après les fêtes.', false)
on conflict (key) do nothing;
