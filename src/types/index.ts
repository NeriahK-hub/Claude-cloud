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
}

export type WalletKind = 'basic' | 'credit' | 'goal';

export interface Settings {
  mainCurrency: string;
  secondCurrency: string | null;
  // rates[X] = combien de devise principale vaut 1 X (ex. rates.USD = 2850 si principale = CDF)
  rates: Record<string, number>;
}

// Ancien type (fichiers de démonstration non utilisés)
export interface BankAccount {
  id: string;
  name: string;
  cardNumber: string; // e.g. "**** 3425"
  fullNumber: string;
  cardType: 'Visa' | 'Mastercard' | 'Apple Pay';
  balance: number;
  currency: string;
  isDefault: boolean;
  themeColor: string;
  expiry: string;
  cvv: string;
  holder: string;
}

export interface MerchantOffer {
  id: string;
  title: string;
  subtitle: string;
  discount: string;
  merchantName: string;
  category: string;
  bannerGradient: string;
  accentColor: string;
  badge: string;
  code: string;
  expiresIn: string;
}

export interface QuickContact {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  avatarBg: string;
  initials: string;
  recentAmount?: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'transaction' | 'promo' | 'security';
}
