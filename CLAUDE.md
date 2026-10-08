# Wallo

PWA de finances personnelles (ex-AetherPay) pour la RDC : portefeuilles, opérations multi-devises (USD/CDF), catégories à deux niveaux, budgets, dettes et prêts, ristournes (tontines), portefeuilles partagés, import/export Money Lover. Interface et textes en **français** (tutoiement), code et noms en anglais, commentaires en français.

## Commandes

- `npm run dev` : serveur local sur http://localhost:3000
- `npm run lint` : vérification TypeScript (`tsc --noEmit`) — à lancer avant chaque commit
- `npm run build` / `npm run deploy` : construit puis publie sur Firebase Hosting (https://wallo-b13b0.web.app)
- `npm run dev:admin` / `npm run deploy:admin` : espace admin (site séparé, dossier `admin/`, port 3001), voir `supabase/README.md`
- `npm run test:db` et `npm run test:sync` : tests de la base et de la synchro sur un PostgreSQL local (base `wallo_test`, voir `supabase/README.md`)

## Architecture

- React 19 + Vite + TypeScript + Tailwind v4, icônes lucide-react. Pas de routeur : `src/App.tsx` tient l'état et passe les handlers à `MobileApp` / `DesktopApp`. Écrans secondaires chargés à la demande (`src/components/pages.ts`).
- Données locales d'abord (`usePersistentState`, clés `ap.*` dans localStorage) ; l'app marche sans compte et hors ligne (service worker généré par `scripts/serviceWorker.ts`).
- Compte et synchro : Supabase (`.env` : URL + clé publishable, publiques). Schéma, règles RLS et fonctions dans `supabase/migrations/` — toute nouvelle migration est un nouveau fichier, à exécuter à la main dans le SQL Editor de Supabase.
- Synchro : `src/lib/sync/engine.ts` (push par empreintes puis pull par curseur, suppressions douces `deleted_at`), `mapping.ts` (lignes <-> objets), `useCloud.ts` (session, déclenchement, temps réel). Toute modification de la synchro doit passer `npm run test:sync`.
- Couleur d'accent (au choix dans Paramètres › Apparence, `src/lib/accent.ts`) : classes `bg-accent`, `hover:bg-accent-hover`, `ring-accent`, `bg-accent/40`… ; le texte posé dessus devient `--on-accent` tout seul. Jamais de `#D8FB52` en dur.
- Mode sombre : `html.dark` remappe les couleurs `slate-*` et `white` dans `src/index.css`. Sélection : classes `is-selected` / `sel-ring` / `is-open` + `<SelCheck />`, jamais de bordure `border-slate-900`.
- Retour haptique : automatique sur tout bouton / lien / `role="button"` (`installTapHaptics` dans `src/lib/haptics.ts`) ; `haptic()` seulement pour les gestes sans bouton ou un retour `'success'` / `'warning'`. Affichage des montants et dates : `formatMoney` / `formatDate` (préférences de `src/lib/display.ts`).

- Notifications : `src/lib/notify.ts` (A : alertes de l'app montrées en notification système ; B : abonnement push). Push serveur : triggers de `supabase/migrations/20261009000000_push.sql` -> file `push_queue` -> Edge Function `supabase/functions/send-push` (pg_cron, `supabase/push_cron.sql`). Gestionnaires `push` / `notificationclick` dans `scripts/serviceWorker.ts`.
- Accueil au choix : `src/lib/homeLayout.ts` (cartes, ordre, cachées ; Paramètres › Accueil). Corbeille 30 jours + « Annuler » : `src/lib/trash.ts` (local, éléments rétablis avec un nouvel identifiant). Aide : `src/data/help.ts` + articles de l'admin via `app_config()` (`help`). Appareils connectés : `src/lib/devices.ts` + migration `20261021`.
- Migrations récentes à exécuter à la main (dans l'ordre) : `20261019` (fréquence « toutes les N »), `20261020` (« à résilier »), `20261021` (appareils), `20261022` (aide admin). L'app marche sans elles : les champs concernés ne sont envoyés que s'ils sont réglés.
- Espace admin : fonctions `admin_*` et table fermée `admins` (`supabase/migrations/20261002000000_admin.sql`). L'app lit fonctionnalités / annonces / icônes via `app_config()` (`src/lib/remoteConfig.ts`, `useFeature('debts')`…), gardées pour le hors ligne.

## Règles

- Ne jamais mettre la clé secrète Supabase (service_role) dans le code ni dans `.env`.
- Garder l'app utilisable hors ligne et sur petit écran (375 px) ; vérifier le mode sombre.
