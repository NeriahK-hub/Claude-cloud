// Centre d'aide : réponses courtes, rangées par thème. D'autres articles peuvent être ajoutés depuis
// l'espace admin (page « Aide ») : ils s'ajoutent à ceux-ci sans mise à jour de l'app.
// Mise en forme du texte : paragraphes séparés par une ligne vide ; « - » = puce ; « 1. » = étape.

export interface HelpArticle {
  id: string;
  title: string;
  body: string;
  category: string;
  platform?: 'iphone' | 'android'; // astuce propre à un téléphone (montrée en premier sur celui-ci)
}

export const HELP_CATEGORIES = ['Démarrer', 'Saisie', 'Suivi', 'Dettes et partage', 'Sécurité', 'iPhone et Android'];

export const HELP_ARTICLES: HelpArticle[] = [
  // ---------- Démarrer ----------
  {
    id: 'add',
    category: 'Démarrer',
    title: 'Noter une dépense ou un revenu',
    body: `Touche le bouton + au milieu de la barre du bas.

1. Choisis Dépense ou Revenu en haut.
2. Tape le montant.
3. Touche la catégorie pour la choisir, et le portefeuille si besoin.
4. Ajoute une note si tu veux, puis Enregistrer.

Le montant, la date et la devise se changent en touchant leur bouton, juste sous le montant.`,
  },
  {
    id: 'home-choose',
    category: 'Démarrer',
    title: 'Choisir ce qui s’affiche à l’accueil',
    body: `Va dans Paramètres › Accueil.

- Active ou coupe chaque carte (santé, bilans, abonnements…).
- Touche les flèches pour la monter ou la descendre.
- « Remettre comme avant » rétablit l’accueil d’origine.

La carte Abonnements est cachée au départ : active-la ici si tu veux voir ce que tes abonnements coûtent chaque mois.`,
  },
  {
    id: 'simple',
    category: 'Démarrer',
    title: 'Un écran plus simple',
    body: `Dans Paramètres › Apparence, choisis l’interface Simple : l’accueil ne garde que l’essentiel, avec de gros boutons.

Tu peux aussi agrandir le texte (Normal, Grand, Très grand) et réduire les animations, au même endroit.`,
  },
  {
    id: 'hide',
    category: 'Démarrer',
    title: 'Masquer mes soldes',
    body: `Touche l’œil à côté de « Ton solde » sur l’accueil, ou en haut de la page Portefeuilles : les soldes deviennent ••••••.

Pour masquer aussi les montants de la liste des opérations, active « Masquer aussi les montants des opérations » dans Paramètres › Apparence. Le réglage reste sur cet appareil.`,
  },
  // ---------- Saisie ----------
  {
    id: 'calc',
    category: 'Saisie',
    title: 'Calculer dans le montant',
    body: `Le clavier a une colonne d’opérations : ÷ × − +.

Tape par exemple 5 000 + 2 500 : le résultat s’affiche juste dessous et c’est lui qui sera enregistré. La multiplication et la division passent avant l’addition et la soustraction.`,
  },
  {
    id: 'batch',
    category: 'Saisie',
    title: 'Noter plusieurs dépenses d’un coup',
    body: `Dans l’ajout d’une dépense, touche « Plusieurs ».

- Remplis une ligne par dépense : note, montant, catégorie.
- « Tes habitudes » ajoute d’un toucher ce que tu notes souvent.
- Le portefeuille et la date valent pour toutes les lignes.

Une ligne avec un montant mais sans catégorie est surlignée en orange avant l’enregistrement.`,
  },
  {
    id: 'usual',
    category: 'Saisie',
    title: 'Montants proposés d’un toucher',
    body: `Quand tu choisis une catégorie que tu as déjà utilisée, ses derniers montants apparaissent sous le montant (par exemple 1 500 CDF pour le taxi). Touche-en un et c’est rempli.`,
  },
  {
    id: 'draft',
    category: 'Saisie',
    title: 'J’ai fermé par erreur',
    body: `Si tu fermes l’ajout après avoir tapé un montant, Wallo garde un brouillon pendant 24 heures. À la prochaine ouverture, touche Reprendre en haut de la fenêtre.`,
  },
  {
    id: 'trash',
    category: 'Saisie',
    title: 'Retrouver ce que j’ai supprimé',
    body: `Juste après une suppression, touche Annuler dans le message qui s’affiche (il reste quelques secondes).

Plus tard : Paramètres › Corbeille. Les opérations, transferts, budgets et opérations qui reviennent y restent 30 jours, puis disparaissent tout seuls.

Les portefeuilles supprimés ne vont pas dans la corbeille : archive-les plutôt.`,
  },
  // ---------- Suivi ----------
  {
    id: 'budgets',
    category: 'Suivi',
    title: 'Budgets conseillés et historique',
    body: `Dans Budgets, « Budgets conseillés » te propose une limite pour les catégories où tu dépenses régulièrement, un peu en dessous de ta moyenne des 3 derniers mois. Un toucher et le budget est créé.

« Historique » montre les 6 dernières périodes de chaque budget : vert (tenu), orange (presque), rouge (dépassé).

Wallo te prévient quand tu atteins 80 % d’un budget, et aussi quand tu dépenses plus vite que prévu.`,
  },
  {
    id: 'subs',
    category: 'Suivi',
    title: 'Abonnements repérés',
    body: `Dans À venir, « Abonnements repérés » liste les dépenses qui reviennent chaque mois, avec le même nom, à peu près le même montant, depuis au moins 3 mois.

- Ajouter : crée l’opération qui revient, déjà remplie.
- Si le prix change, Wallo te le dit (« Le prix a augmenté »).
- Pour résilier : ouvre l’opération et active « À résilier » : une alerte te le rappelle avant l’échéance.`,
  },
  {
    id: 'upcoming',
    category: 'Suivi',
    title: 'À venir : liste et calendrier',
    body: `À venir regroupe tes factures et ce qui revient. Passe de Liste à Calendrier en haut : les points colorés montrent les jours prévus (rouge : à payer, orange : facture, vert : à recevoir). Touche un jour pour voir le détail.

Tu peux régler la fréquence : chaque semaine, toutes les 2 semaines, tous les 3 mois, ou une fréquence à toi (jours, semaines, mois, ans).`,
  },
  {
    id: 'curve',
    category: 'Suivi',
    title: 'Évolution du solde et « Et si… »',
    body: `Dans Transactions › Rapport, « Évolution du solde » montre ton solde à la fin de chacun des 12 derniers mois. Touche ou glisse sur la courbe pour lire un mois.

« Et si je dépensais moins ? » calcule ce que tu garderais en un mois, un an et 5 ans si tu réduisais une catégorie de 5 à 50 %.`,
  },
  {
    id: 'unusual',
    category: 'Suivi',
    title: 'Pourquoi une alerte « dépense inhabituelle » ?',
    body: `Wallo la déclenche quand une dépense est au moins 3 fois plus élevée que ta dépense habituelle dans la même catégorie (calculée sur les 4 derniers mois, avec au moins 5 dépenses). C’est juste un signal : si c’est normal, ne fais rien. Sinon, corrige l’opération.`,
  },
  // ---------- Dettes et partage ----------
  {
    id: 'debts',
    category: 'Dettes et partage',
    title: 'Dettes et prêts',
    body: `Dans l’ajout, choisis l’onglet Dette / Prêt. Quatre cas :

- L’argent sort : Prêt accordé (j’ai prêté), Remboursement de dette (je rembourse).
- L’argent entre : Dette contractée (on m’a prêté), Prêt remboursé (on me rend).

Indique avec qui. Tu peux ajouter des intérêts et une date de remboursement.`,
  },
  {
    id: 'share',
    category: 'Dettes et partage',
    title: 'Partager un portefeuille ou un objectif',
    body: `Ouvre un portefeuille (même un objectif d’épargne) et touche « Partager ». Envoie le lien ou le code à la personne : elle rejoint avec son compte Wallo.

Chacun voit les mêmes opérations, et chaque opération indique qui l’a faite. Il faut un compte connecté pour partager.`,
  },
  // ---------- Sécurité ----------
  {
    id: 'lock',
    category: 'Sécurité',
    title: 'Verrouiller Wallo',
    body: `Paramètres › Verrouillage : choisis un code à 4 chiffres, et active Face ID ou l’empreinte si ton téléphone le permet. Tu peux régler après combien de temps hors de l’app le code est redemandé.`,
  },
  {
    id: 'devices',
    category: 'Sécurité',
    title: 'Appareils connectés',
    body: `Dans Profil, ouvre « Appareils connectés » sous ton compte : tu vois où ton compte est ouvert.

Perdu ou prêté ton téléphone ? Touche « Déconnecter les autres appareils » : ils devront se reconnecter avec un code. Celui que tu tiens reste connecté.`,
  },
  {
    id: 'backup',
    category: 'Sécurité',
    title: 'Changer de téléphone',
    body: `Avec un compte, tout se retrouve en te connectant sur le nouveau téléphone.

Sans compte : Paramètres › Mes données › Exporter, garde le fichier, puis restaure-le sur le nouveau téléphone.`,
  },
  // ---------- iPhone et Android ----------
  {
    id: 'ios-install',
    category: 'iPhone et Android',
    platform: 'iphone',
    title: 'Installer Wallo sur ton iPhone',
    body: `Ouvre Wallo dans Safari (pas dans une autre app).

1. Touche le bouton Partager (le carré avec la flèche vers le haut).
2. Fais défiler et touche « Sur l’écran d’accueil ».
3. Touche Ajouter.

Wallo s’ouvre ensuite en plein écran, comme une vraie app, et marche aussi sans réseau.`,
  },
  {
    id: 'ios-notif',
    category: 'iPhone et Android',
    platform: 'iphone',
    title: 'Recevoir les notifications sur iPhone',
    body: `Les notifications ne marchent sur iPhone que si Wallo est installée sur l’écran d’accueil (iOS 16.4 ou plus récent).

1. Installe Wallo sur l’écran d’accueil.
2. Ouvre Wallo depuis cette icône, puis Paramètres › Notifications › Activer.
3. Accepte la demande de ton iPhone.

Si tu as refusé par erreur : Réglages de l’iPhone › Notifications › Wallo.`,
  },
  {
    id: 'ios-haptic',
    category: 'iPhone et Android',
    platform: 'iphone',
    title: 'Vibrations au toucher sur iPhone',
    body: `Le retour haptique demande iOS 18 ou plus récent. Si tu ne sens rien, vérifie dans Réglages › Sons et vibrations que « Retour haptique du système » est activé, et que « Retour haptique » est bien allumé dans Wallo (Paramètres › Apparence).`,
  },
  {
    id: 'ios-faceid',
    category: 'iPhone et Android',
    platform: 'iphone',
    title: 'Face ID ne se propose pas',
    body: `Active d’abord le verrouillage par code (Paramètres › Verrouillage). Face ID ou Touch ID est ensuite proposé. Si ton iPhone n’a pas encore de code ou de Face ID configuré, fais-le d’abord dans les Réglages de l’iPhone.`,
  },
  {
    id: 'ios-update',
    category: 'iPhone et Android',
    platform: 'iphone',
    title: 'L’app ne se met pas à jour',
    body: `Wallo se met à jour toute seule à l’ouverture quand tu as du réseau. Si tu ne vois pas les nouveautés : ferme complètement l’app (balaye-la vers le haut dans le sélecteur d’apps), puis rouvre-la. Une deuxième ouverture est parfois nécessaire.`,
  },
  {
    id: 'android-shortcuts',
    category: 'iPhone et Android',
    platform: 'android',
    title: 'Raccourcis sur l’icône (Android)',
    body: `Une fois Wallo installée, appuie longtemps sur son icône : tu peux ajouter une dépense, un revenu, ouvrir À venir ou les Budgets sans passer par l’accueil. Ces raccourcis n’existent pas sur iPhone.`,
  },
  {
    id: 'android-install',
    category: 'iPhone et Android',
    platform: 'android',
    title: 'Installer Wallo sur Android',
    body: `Dans Chrome, touche le menu (⋮) puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »). Wallo apparaît comme une app et marche aussi sans réseau.`,
  },
];
