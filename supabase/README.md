# Base de données Wallo (Supabase)

## Installer le schéma (une seule fois)

1. Dans ton projet Supabase : **SQL Editor** › **New query**.
2. Colle tout le contenu de `migrations/20260929000000_wallo_init.sql`, puis **Run**.
3. Tu dois voir « Success. No rows returned ».

Le schéma crée les tables (profils, portefeuilles et leurs membres, transactions, catégories,
budgets, icônes, ristournes), les règles d'accès (chacun ne voit que ses données et les
portefeuilles / ristournes partagés avec lui) et le temps réel pour les portefeuilles partagés.

## Tester les règles d'accès en local (développeurs)

Avec un PostgreSQL 16 local :

```bash
createdb wallo_test
psql -v ON_ERROR_STOP=1 -d wallo_test -f supabase/tests/local_auth_stub.sql -f supabase/migrations/20260929000000_wallo_init.sql
psql -v ON_ERROR_STOP=1 -d wallo_test -f supabase/tests/rls_test.sql
```

`local_auth_stub.sql` imite la partie « comptes » de Supabase : ne l'exécute jamais sur Supabase.

Test de la synchro (plusieurs appareils et comptes simulés, avec un export Money Lover) :

```bash
DATABASE_URL=postgres://postgres:motdepasse@127.0.0.1:5432/wallo_test npm run test:sync
```
