// 'transfer' = mouvement entre deux portefeuilles, 'adjustment' = correction de solde :
// ni l'un ni l'autre n'est une vraie dépense ou un vrai revenu (exclus des statistiques).
export type TransactionType = 'receive' | 'transfer' | 'send' | 'payment' | 'adjustment';

export interface Transaction {
  id: string;
  title: string;
  createdAt: string; // date ISO
  amount: number; // positif = entrée, négatif = sortie, dans la devise du portefeuille
  currency: string; // devise du portefeuille au moment de l'enregistrement
  walletId: string;
  originalAmount?: number; // montant tapé, si la devise choisie diffère de celle du portefeuille
  originalCurrency?: string;
  type: TransactionType;
  category: string; // nom de la catégorie
  categoryId?: string;
  avatarType: 'icon' | 'image';
  avatarValue: string; // nom d'icône lucide, ou image (data URL)
  color: string; // couleur de la catégorie
  referenceNumber?: string;
  transferId?: string; // relie les deux moitiés d'un transfert
  counterpartWalletId?: string; // l'autre portefeuille du transfert
  status?: 'completed' | 'pending' | 'failed';
  excludeFromReport?: boolean; // vraie dépense/revenu, mais gardé hors des statistiques (ex. prêts importés de Money Lover)
  withPerson?: string; // « Avec » : la personne concernée (prêt, dette…)
  interest?: number; // prêt / emprunt : intérêts prévus, dans la devise de l'opération (s'ajoutent au reste à rembourser)
  dueDate?: string; // prêt / emprunt : à rembourser au plus tard le (AAAA-MM-JJ) ; '' = échéance retirée
  memberId?: string; // portefeuille partagé : qui a fait l'opération (absent = moi)
}

export interface Wallet {
  id: string;
  name: string;
  icon: string; // nom d'une icône lucide
  image?: string; // ou image personnalisée (data URL), prend la place de l'icône
  color: string;
  currency: string; // code ISO : "USD", "CDF"...
  initialBalance: number;
  includeInTotal: boolean;
  archived: boolean;
  kind?: WalletKind; // absent = 'basic' (anciens portefeuilles)
  creditLimit?: number; // seulement 'credit'
  goalAmount?: number; // seulement 'goal'
  goalDate?: string; // seulement 'goal', format AAAA-MM-JJ
  goalWhy?: string; // seulement 'goal' : « Pourquoi cet objectif ? » ('' = retiré)
  goalReminder?: GoalReminder | null; // seulement 'goal' : rappel chaque semaine (null = retiré)
  roundUp?: boolean; // seulement 'goal' : reçoit les arrondis des dépenses (un seul objectif à la fois)
  challenge?: GoalChallenge | null; // seulement 'goal' : défi d'épargne (52 semaines, 1 000 FC par jour…)
  members?: WalletMember[]; // portefeuille partagé : les autres personnes (moi n'y figure pas)
  ownerId?: string; // compte en ligne : propriétaire (absent = moi, portefeuille créé ici)
  myMemberId?: string; // compte en ligne : ma ligne de membre dans ce portefeuille
}

// Une personne avec qui on partage un portefeuille (ex. son conjoint)
export interface WalletMember {
  id: string;
  name: string;
  color: string;
  contact?: string; // téléphone ou e-mail, pour l'inviter plus tard
  removed?: boolean; // retiré du partage : on garde son nom sur ses anciennes opérations
  userId?: string; // compte en ligne de cette personne (elle a rejoint le portefeuille)
  invited?: boolean; // invitation envoyée par e-mail, pas encore acceptée
  owner?: boolean; // propriétaire du portefeuille (vu depuis le téléphone d'un autre membre)
}

export type WalletKind = 'basic' | 'credit' | 'goal';

// Défi d'épargne : un objectif dont le montant à mettre suit une règle
// '52w' : base × n° de la semaine (1, 2, 3… 52) ; 'daily' : base chaque jour pendant `days` jours ;
// 'weekend' : ce qu'on n'a pas dépensé le week-end (par rapport à d'habitude) ; 'roundup' : les arrondis
export interface GoalChallenge {
  type: '52w' | 'daily' | 'weekend' | 'roundup';
  start: string; // AAAA-MM-JJ
  base?: number; // '52w' et 'daily' : montant de base, dans la devise de l'objectif
  days?: number; // 'daily' : durée en jours
}

// Rappel d'un objectif : « Chaque vendredi, mets 10 $ dans Moto »
export interface GoalReminder {
  day: number; // 0 dimanche … 6 samedi
  amount: number; // dans la devise de l'objectif
}

export interface Settings {
  mainCurrency: string;
  secondCurrency: string | null;
  // rates[X] = combien de devise principale vaut 1 X (ex. rates.USD = 2850 si principale = CDF)
  rates: Record<string, number>;
}

// Opération qui revient (salaire, loyer, abonnement) ou facture (SNEL, REGIDESO, minerval…)
export interface Recurring {
  id: string;
  title: string;
  amount?: number; // absent = montant à demander au moment de payer (facture qui varie)
  currency: string;
  walletId: string;
  direction: 'out' | 'in';
  categoryId?: string;
  frequency: 'week' | 'month' | 'year' | 'days';
  everyDays?: number; // seulement 'days' : tous les N jours
  cancelBy?: string; // abonnement « à résilier » : rappel à cette date (AAAA-MM-JJ) ; '' = rappel retiré
  every?: number; // semaine / mois / année : tous les N (absent = 1 : « toutes les 2 semaines », « tous les 3 mois »)
  nextDate: string; // AAAA-MM-JJ : prochaine fois (facture : date limite)
  anchorDay?: number; // chaque mois / année : le jour voulu (31 -> 28 février puis de nouveau 31 mars)
  mode: 'ask' | 'auto'; // me demander / créer toute seule
  bill?: boolean; // facture : rappel quelques jours avant la date limite
  remindDays?: number; // facture : combien de jours avant (3 par défaut)
  active: boolean;
  createdBy?: string; // compte qui l'a créée (absent = moi)
  createdAt: string;
}

// Ristourne (tontine) : chacun cotise à chaque tour, un membre reçoit la cagnotte à tour de rôle
export interface Ristourne {
  id: string;
  name: string;
  contribution: number; // cotisation de chaque membre, à chaque tour
  currency: string;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'custom';
  everyDays?: number; // seulement 'custom' : un tour tous les N jours (1 à 365)
  keeperId?: string; // membre qui garde la cagnotte (absent = l'organisateur)
  holding?: 'cash' | 'digital'; // argent gardé en main, ou sur un compte
  holdingDetails?: string; // compte : n° Mobile Money, banque… (facultatif)
  startDate: string; // AAAA-MM-JJ : date du 1er tour
  members: RistourneMember[];
  payments: RistournePayment[];
  ownerId?: string; // compte en ligne : propriétaire (absent = moi)
}

export interface RistourneMember {
  id: string;
  name: string;
  turn: number; // tour où ce membre reçoit la cagnotte (1, 2, 3…)
  isMe?: boolean;
  contact?: string; // e-mail pour l'inviter
  userId?: string; // compte en ligne (il a rejoint)
  invited?: boolean;
  removed?: boolean;
}

export interface RistournePayment {
  id: string;
  memberId: string;
  turn: number;
  amount: number;
  paidAt: string; // ISO
  pending?: boolean; // noté par un membre, pas encore confirmé par l'organisateur / le gardien
}

// Dette (ou prêt) partagée avec une autre personne qui a Wallo : un carnet de mouvements commun.
// Les portefeuilles restent à chacun : un mouvement peut être noté aussi dans un portefeuille (txId).
export interface DebtShare {
  id: string;
  side: 'receivable' | 'payable'; // MON côté : receivable = on me doit
  person: string; // nom de l'autre personne chez moi
  status: 'open' | 'active' | 'declined'; // open = lien envoyé, pas encore accepté
  otherLeft?: boolean; // l'autre ne suit plus cette dette
  ownerId?: string; // compte qui l'a partagée (absent = moi)
  moves: DebtMove[];
}

export interface DebtMove {
  id: string;
  kind: 'more' | 'repay' | 'interest'; // more : la dette grandit (prêt / emprunt) ; repay : remboursement ; interest : intérêts
  amount: number;
  currency: string;
  date: string; // ISO
  note?: string;
  pending: boolean; // à confirmer par celui qui ne l'a pas noté
  recordedBy: string; // compte qui l'a noté
  deleteRequestedBy?: string; // compte qui demande sa suppression
  txId?: string; // MON opération liée dans un portefeuille
}

// Budget : pour une catégorie (sous-catégories comprises) ou pour toutes les dépenses.
// Semaine / mois / trimestre / année : recommence automatiquement à chaque période.
// Personnalisé : une seule période, du « from » au « to ».
export type BudgetPeriod = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface Budget {
  id: string;
  categoryId: string | null; // null = toutes les dépenses
  amount: number; // par période
  currency: string;
  createdAt: string;
  period?: BudgetPeriod; // absent = 'month' (budgets d'avant)
  from?: string; // personnalisé : AAAA-MM-JJ (inclus)
  to?: string; // personnalisé : AAAA-MM-JJ (inclus)
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'transaction' | 'promo' | 'security' | 'budget' | 'announcement' | 'goal';
}
