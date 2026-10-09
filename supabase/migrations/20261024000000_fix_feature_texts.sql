-- Textes des fonctionnalites de l'espace admin : corrige les accents abimes (mojibake).
-- Les accents sont ecrits en codes \XXXX (U&'...') : le texte reste intact meme s'il est copie-colle
-- depuis un Mac ou un autre editeur. A executer dans le SQL Editor de Supabase.
-- Ne change pas l'etat des fonctionnalites (activee / coupee).

update public.app_features set label = U&'Dettes et pr\00EAts', description = U&'Onglet \00AB Dette / Pr\00EAt \00BB \00E0 l''ajout et page Dettes et pr\00EAts' where key = 'debts';
update public.app_features set label = U&'Budgets', description = U&'Page Budgets et raccourci de l''accueil' where key = 'budgets';
update public.app_features set label = U&'Ristournes', description = U&'Tontines : page Ristourne et raccourci de l''accueil' where key = 'ristournes';
update public.app_features set label = U&'Portefeuilles partag\00E9s', description = U&'Inviter des membres et rejoindre un portefeuille partag\00E9' where key = 'sharedWallets';
update public.app_features set label = U&'Import de fichiers', description = U&'Import Money Lover / Excel / CSV dans Param\00E8tres' where key = 'importData';
update public.app_features set label = U&'Connexion / comptes', description = U&'Se connecter et synchroniser (les personnes d\00E9j\00E0 connect\00E9es restent connect\00E9es)' where key = 'accounts';
update public.app_features set label = U&'Wrapped de l''ann\00E9e', description = U&'Calendrier automatique : compte \00E0 rebours du 15 au 30 novembre, puis la carte \00AB Voici ton ann\00E9e \00BB sur l''accueil du 1er d\00E9cembre au 31 janvier. Coup\00E9 : aucune carte Wrapped.' where key = 'wrapped';
update public.app_features set label = U&'Wrapped : montrer maintenant', description = U&'Allum\00E9 : la carte du Wrapped appara\00EEt tout de suite sur l''accueil de tout le monde, m\00EAme hors d\00E9cembre et janvier. \00C0 \00E9teindre ensuite.' where key = 'wrappedNow';
update public.app_features set label = U&'Wrapped : compte \00E0 rebours', description = U&'La carte \00AB X jours avant ton Wrapped \00BB du 15 au 30 novembre.' where key = 'wrappedCountdown';
update public.app_features set label = U&'Design des f\00EAtes', description = U&'No\00EBl (neige, couleurs rouge et vert) jusqu''au 26 d\00E9cembre, puis Nouvel an (or, paillettes). Pour tout le monde, \00E0 \00E9teindre apr\00E8s les f\00EAtes.' where key = 'festive';
