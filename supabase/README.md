# Base de données Wallo (Supabase)

## Installer le schéma (une seule fois)

1. Dans ton projet Supabase : **SQL Editor** › **New query**.
2. Colle tout le contenu de `migrations/20260929000000_wallo_init.sql`, puis **Run**. Recommence avec chaque fichier suivant de `migrations/`, dans l'ordre (`20260930000000_delete_account.sql`, `20261001000000_wallet_invite_links.sql`, `20261002000000_admin.sql`, `20261003000000_ads.sql`, `20261004000000_icon_folders.sql`, `20261005000000_promo_rpc.sql`, `20261006000000_ristourne_custom_invites.sql`, `20261007000000_shared_debts.sql`, `20261008000000_debt_interest.sql`, `20261009000000_push.sql`, puis `20261010000000_reminders.sql`).
3. Tu dois voir « Success. No rows returned ».

Le schéma crée les tables (profils, portefeuilles et leurs membres, transactions, catégories,
budgets, icônes, ristournes), les règles d'accès (chacun ne voit que ses données et les
portefeuilles / ristournes partagés avec lui) et le temps réel pour les portefeuilles partagés.

`20261001000000_wallet_invite_links.sql` ajoute l'invitation par lien : le propriétaire envoie
`https://…/r/CODE` (valable 7 jours), la personne se connecte avec n'importe quelle adresse et rejoint.

`20261007000000_shared_debts.sql` ajoute les dettes et prêts partagés : on envoie `https://…/d/CODE` à la
personne, elle accepte (ou refuse le montant) ; ensuite chaque mouvement noté par l'un est confirmé par
l'autre, un mouvement confirmé ne disparaît que si les deux sont d'accord, et « supprimer » une dette
revient à ne plus la suivre : elle reste chez l'autre.

`20261008000000_debt_interest.sql` ajoute les intérêts : un prêt (ou un emprunt) peut avoir des intérêts
prévus, qui s'ajoutent au reste à rembourser ; pour une dette partagée, c'est un mouvement à confirmer.

`20261002000000_admin.sql` ajoute l'espace admin (site séparé, dossier `admin/`) : statistiques
globales, comptes (bloquer, supprimer), annonces, icônes pour tous, fonctionnalités activables.
L'admin ne voit ni les montants ni les opérations des utilisateurs.

`20261003000000_ads.sql` ajoute les publicités : bannières 4:1 (1600 × 400 px) sur l'accueil, images dans le
dossier public « banners » de Supabase Storage, vues et clics comptés sans savoir qui.

### Devenir administrateur (une fois)

Dans le SQL Editor, avec **ton** adresse (le compte doit déjà exister : connecte-toi une fois dans Wallo) :

```sql
insert into public.admins (user_id) select id from auth.users where email = 'ton.adresse@exemple.com';
```

Retirer un admin : `delete from public.admins where user_id = (select id from auth.users where email = '…');`

### Mettre le site admin en ligne (une fois)

```bash
npx firebase-tools hosting:sites:create wallo-admin
npm run deploy:admin
```

Si le nom `wallo-admin` est déjà pris, choisis-en un autre et mets-le aussi dans `.firebaserc`
(`targets › hosting › admin`). Le site sera à l'adresse `https://wallo-admin.web.app`.

### Notifications push (une fois)

Les notifications « app fermée » (invitation, paiement de ristourne à confirmer, remboursement noté,
opération dans un portefeuille partagé, rappel de tour le matin…) partent de Supabase.
Sans ces étapes, l'app marche quand même : elle affiche seulement ses propres alertes pendant qu'elle tourne.

1. **Migrations** : exécute `migrations/20261009000000_push.sql` puis `migrations/20261010000000_reminders.sql`
   (échéances des dettes, rappel du soir) dans le SQL Editor, comme les autres.
2. **Clés VAPID** (la « signature » des notifications) : dans un terminal, sur ton ordinateur :

   ```bash
   npx web-push generate-vapid-keys
   ```

   Garde les deux lignes affichées. La **Public Key** va dans `.env` :
   `VITE_VAPID_PUBLIC_KEY=…` (publique, elle finit dans l'app). La **Private Key** ne va **jamais** dans le code ni dans `.env`.
3. **Publier la fonction d'envoi** (Supabase CLI, une fois connecté avec `npx supabase login`) :

   ```bash
   npx supabase link --project-ref TON_REF_PROJET
   npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:ton.adresse@exemple.com PUSH_SECRET=une-longue-chaine-au-hasard
   npx supabase functions deploy send-push --no-verify-jwt
   ```

   `TON_REF_PROJET` : l'identifiant dans l'adresse du projet (`https://TON_REF_PROJET.supabase.co`).
   `--no-verify-jwt` : la fonction est protégée par `PUSH_SECRET`, que seule la tâche planifiée connaît.
4. **Tâches planifiées** : ouvre `push_cron.sql`, remplace `REMPLACER_URL` et `REMPLACER_SECRET`
   (la même valeur que `PUSH_SECRET`), puis exécute-le dans le SQL Editor. Il envoie la file chaque minute
   et lance les rappels de ristourne chaque matin à 8 h (heure de Kinshasa).
5. **Remettre l'app en ligne** (`npm run deploy`) pour qu'elle prenne la clé publique, puis dans l'app :
   Paramètres › Notifications › Activer.

Vérifier : `select * from push_subscriptions;` (un appareil par ligne), `select * from push_queue order by id desc limit 20;`
(`sent_at` rempli = parti), et les journaux de la fonction dans Edge Functions › send-push › Logs.

## Tester les règles d'accès en local (développeurs)

Avec un PostgreSQL 16 local :

```bash
createdb wallo_test
psql -v ON_ERROR_STOP=1 -d wallo_test -f supabase/tests/local_auth_stub.sql -f supabase/migrations/20260929000000_wallo_init.sql -f supabase/migrations/20260930000000_delete_account.sql -f supabase/migrations/20261001000000_wallet_invite_links.sql -f supabase/migrations/20261002000000_admin.sql -f supabase/migrations/20261003000000_ads.sql -f supabase/migrations/20261004000000_icon_folders.sql -f supabase/migrations/20261005000000_promo_rpc.sql -f supabase/migrations/20261006000000_ristourne_custom_invites.sql -f supabase/migrations/20261007000000_shared_debts.sql -f supabase/migrations/20261008000000_debt_interest.sql -f supabase/migrations/20261009000000_push.sql -f supabase/migrations/20261010000000_reminders.sql -f supabase/migrations/20261011000000_goals.sql -f supabase/migrations/20261012000000_upcoming.sql -f supabase/migrations/20261013000000_feedback.sql -f supabase/migrations/20261014000000_streak_reminder.sql -f supabase/migrations/20261015000000_wrapped_features.sql -f supabase/migrations/20261016000000_festive.sql -f supabase/migrations/20261017000000_usage.sql -f supabase/migrations/20261018000000_scale.sql
psql -v ON_ERROR_STOP=1 -d wallo_test -f supabase/tests/rls_test.sql -f supabase/tests/admin_test.sql -f supabase/tests/ristourne_invite_test.sql
```

Dettes partagées (dans sa propre session, sur une base fraîche : il crée ses propres comptes de test) :

```bash
psql -v ON_ERROR_STOP=1 -d wallo_test -f supabase/tests/debt_share_test.sql
```

`local_auth_stub.sql` imite la partie « comptes » de Supabase : ne l'exécute jamais sur Supabase.

Test de la synchro (plusieurs appareils et comptes simulés, avec un export Money Lover) :

```bash
DATABASE_URL=postgres://postgres:motdepasse@127.0.0.1:5432/wallo_test MONEYLOVER_XLSX=chemin/vers/export.xlsx npm run test:sync
```

Sans PostgreSQL installé, Docker suffit :

```bash
docker run -d --name wallo-pg -e POSTGRES_PASSWORD=wallo-test -e POSTGRES_DB=wallo_test -p 5432:5432 postgres:16
```

(puis les mêmes commandes avec `docker exec -i wallo-pg psql -U postgres …` à la place de `psql`).
