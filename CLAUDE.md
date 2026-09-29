# Wallo

PWA de finances personnelles (ex-AetherPay) pour la RDC : portefeuilles, opérations multi-devises (USD/CDF), catégories à deux niveaux, budgets, dettes et prêts, ristournes (tontines), portefeuilles partagés, import/export Money Lover. Interface et textes en **français** (tutoiement), code et noms en anglais, commentaires en français.

## Commandes

- `npm run dev` : serveur local sur http://localhost:3000
- `npm run lint` : vérification TypeScript (`tsc --noEmit`) — à lancer avant chaque commit
- `npm run build` / `npm run deploy` : construit puis publie sur Firebase Hosting (https://wallo-b13b0.web.app)
- `npm run test:db` et `npm run test:sync` : tests de la base et de la synchro sur un PostgreSQL local (base `wallo_test`, voir `supabase/README.md`)

## Architecture

- React 19 + Vite + TypeScript + Tailwind v4, icônes lucide-react. Pas de routeur : `src/App.tsx` tient l'état et passe les handlers à `MobileApp` / `DesktopApp`. Écrans secondaires chargés à la demande (`src/components/pages.ts`).
- Données locales d'abord (`usePersistentState`, clés `ap.*` dans localStorage) ; l'app marche sans compte et hors ligne (service worker généré par `scripts/serviceWorker.ts`).
- Compte et synchro : Supabase (`.env` : URL + clé publishable, publiques). Schéma, règles RLS et fonctions dans `supabase/migrations/` — toute nouvelle migration est un nouveau fichier, à exécuter à la main dans le SQL Editor de Supabase.
- Synchro : `src/lib/sync/engine.ts` (push par empreintes puis pull par curseur, suppressions douces `deleted_at`), `mapping.ts` (lignes <-> objets), `useCloud.ts` (session, déclenchement, temps réel). Toute modification de la synchro doit passer `npm run test:sync`.
- Mode sombre : `html.dark` remappe les couleurs `slate-*` et `white` dans `src/index.css`. Sélection : classes `is-selected` / `sel-ring` / `is-open` + `<SelCheck />`, jamais de bordure `border-slate-900`.
- Retour haptique : `haptic()` de `src/lib/haptics.ts`, dans les gestionnaires de clic. Affichage des montants et dates : `formatMoney` / `formatDate` (préférences de `src/lib/display.ts`).

## Règles

- Ne jamais mettre la clé secrète Supabase (service_role) dans le code ni dans `.env`.
- Garder l'app utilisable hors ligne et sur petit écran (375 px) ; vérifier le mode sombre.
