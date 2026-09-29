# Wallo

Gestion de budget : portefeuilles (cash, Mobile Money, banque, objectifs, crédit, partagés),
dépenses et revenus multi-devises, transferts, rapports par période et par catégorie,
import / export Money Lover (Excel), mode sombre.

## Lancer l'app en local

Prérequis : Node.js 18 ou plus récent.

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:3000. Sur un téléphone du même Wi-Fi : `http://<IP-de-l-ordinateur>:3000`
(l'adresse s'affiche dans le terminal sous « Network »).

## Vérifications

```bash
npm run lint    # vérification des types (TypeScript)
npm run build   # version de production dans dist/
```

## Où sont les choses

- `src/App.tsx` : les données (portefeuilles, transactions, catégories, réglages) et les actions.
- `src/components/` : les écrans (accueil, portefeuilles, rapport, historique, paramètres…).
- `src/lib/` : calculs d'argent et de devises, périodes, import / export, icônes personnalisées.
- `public/` : icônes de l'app et manifeste (installation sur l'écran d'accueil).
