# État du projet Wallo

Dernière mise à jour : 26 octobre 2026.

## Version en ligne

| Où | Version |
|---|---|
| Mac (`/Users/neriah/Neriah/APPS PROJECT/Wallo`, branche `main`) | 1.0.0 · `a913867` |
| GitHub (`main`) | 1.0.0 · `a913867` |
| En ligne (https://wallo-b13b0.web.app) | 1.0.0 · `a913867` |

La version qui tourne est affichée en bas de **Paramètres** : numéro, date du build et commit. Un « + » après le commit veut dire que l'app a été construite avec des modifications non commitées.

## Publier une nouvelle version

Toujours depuis `main`, sur le Mac :

```bash
cd "/Users/neriah/Neriah/APPS PROJECT/Wallo"
git checkout main
git pull
npm run deploy
```

- Firebase : il faut être connecté avec le compte Google qui possède le projet `wallo-b13b0` (`npx firebase-tools login:list` pour voir le compte connecté, `login:add` puis `login:use` pour en changer). `neriahkakesa80` et `neriahkakesa70` n'y ont pas accès.
- Avant une mise en ligne notable, monter `version` dans `package.json`.
- Après une mise en ligne : vérifier le commit en bas de Paramètres (sans « + »).

## Supabase : migrations

- Tout est installé jusqu'à `20261029000000_debt_refuse.sql`, ainsi que la tâche `wallo-debt-follow-up` (étape 8 de `supabase/push_cron.sql`).
- L'ancienne version des relances venue du Mac (`20261019000000_debt_followup.sql`, branche `travail-local-mac`) avait été installée. Elle a été défaite le 26 octobre : colonnes `asked_at` et `nudged_at`, fonctions `nudge_debt_move`, `push_debt_pending_reminders` et `debt_auto_confirm_days`, tâche `wallo-debt-pending`. Ne pas la relancer.
- Il reste une fonction inutilisée, sans effet : `push_debt_move_label`.
- `push_cron.sql` ne se lance pas en entier une deuxième fois, car le coffre (Vault) existe déjà. Lancer seulement la nouvelle ligne.
- Copier les migrations depuis GitHub (« Copy raw file ») et écrire les accents en codes `U&'\00E9'` (voir `CLAUDE.md`).

## Reste à faire

1. **Protection contre la suppression définitive** : la migration `no_hard_delete` est sur la branche `claude/laughing-knuth-3rjob5`, pas encore dans `main`. Sans elle, `supabase/tests/rls_test.sql` échoue.
2. **Connexion Google sur localhost** : ajouter `http://localhost:3000/**` dans Supabase › Authentication › URL Configuration › Redirect URLs (sinon on revient sur le site en ligne).
3. **Essayer « Refuser »** sur une vraie dette partagée à deux, et vérifier l'affichage sur téléphone (375 px) et en mode sombre.
4. **Lancer `npm run test:sync`** avec l'export Money Lover (`MONEYLOVER_XLSX=…`).
5. **Faire le ménage des vieilles branches** sur GitHub, toutes réunies dans `main` ou abandonnées :
   - `claude/fervent-turing-bvrlzf`, `claude/sharp-bardeen-cryv56`, `claude/stoic-sagan-pybosv` ;
   - `travail-local-mac` (les icônes et « Refuser » ont été repris, le reste remplacé) ;
   - `wallo-oct-2026`, `main-p6ib4v`.

   À garder jusqu'au point 1 : `claude/laughing-knuth-3rjob5`.

## Historique de la remise en ordre (26 octobre 2026)

- `main` était resté au 7 octobre. Le site en ligne tournait sur `claude/fervent-turing-bvrlzf` (10 octobre), et le Mac avait du travail non commité.
- Le travail du Mac a été sauvegardé sur `travail-local-mac`. Ses icônes et le bouton « Refuser » ont été repris dans la version récente.
- PR #3 : tout dans `main` (version 1.0.0). PR #4 : migrations des dettes en ASCII.
