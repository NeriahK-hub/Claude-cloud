import { Budget, Recurring, Ristourne, RistourneMember, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { BalanceInfo } from '../lib/money';
import { Backup, ImportPlan } from '../lib/importExport';
import type { Cloud } from '../lib/sync/useCloud';
import type { DebtPreset, SharedDebts } from './DebtsView';
import type { DebtEntry } from '../lib/debts';
import { HomeAction } from './BalanceSection';
import { Page } from './BottomNav';
import type { DuplicatePlan } from '../lib/dedupe';
import type { Period } from '../lib/periods';

// Tout ce que App.tsx donne aux deux interfaces (mobile et PC)
export interface SharedProps {
  page: Page;
  onNavigate: (page: Page) => void;
  settings: Settings;
  onChangeSettings: (s: Settings) => void;
  wallets: Wallet[];
  activeWalletLabel: string;
  activeWallet: Wallet | null; // null = « Tous les portefeuilles »
  balance: BalanceInfo;
  transactions: Transaction[]; // celles du portefeuille choisi sur l'accueil
  allTransactions: Transaction[];
  unreadCount: number;
  onQuickAction: (action: HomeAction) => void;
  onAddExpense: () => void;
  onOpenAccountPicker: () => void;
  onOpenNotifications: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  categories: Category[];
  onAddCategory: (cat: Omit<Category, 'id'>) => void;
  onDeleteCategory: (id: string) => void;
  onUpdateCategory: (id: string, changes: Omit<Category, 'id'>) => void;
  onAddWallet: (w: Omit<Wallet, 'id' | 'archived'>) => void;
  onUpdateWallet: (id: string, changes: Partial<Wallet>) => void;
  onDeleteWallet: (id: string) => void;
  // fromAmount et fee dans la devise de « from », toAmount dans celle de « to »
  onTransfer: (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number, createdAt?: string) => void;
  onAdjustBalance: (walletId: string, newBalance: number) => void;
  onReorderWallets: (ids: string[]) => void;
  onRemoveDuplicates: (plan: DuplicatePlan) => void;
  budgets: Budget[];
  recurrings: Recurring[]; // opérations qui reviennent et factures (portefeuille encore là)
  onAddRecurring: (r: Omit<Recurring, 'id' | 'createdAt' | 'active'>) => void;
  onUpdateRecurring: (id: string, changes: Partial<Recurring>) => void;
  onDeleteRecurring: (id: string) => void;
  onConfirmRecurring: (r: Recurring, amount?: number) => void; // « Oui » / « Payé »
  onSkipRecurring: (r: Recurring) => void; // « Pas cette fois »
  onAddBudget: (b: Omit<Budget, 'id' | 'createdAt'>) => void;
  onUpdateBudget: (id: string, changes: Partial<Budget>) => void;
  onDeleteBudget: (id: string) => void;
  onRestoreTrash: (id: string) => void; // Paramètres › Corbeille : rétablir ce qui a été supprimé
  cloud: Cloud;
  onOpenJoin: () => void; // « Rejoindre un portefeuille » avec un lien ou un code
  onOpenJoinRistourne: () => void; // « Rejoindre une ristourne » avec un code à taper
  onOpenScan: () => void; // « Scanner un code » QR d'invitation, dans l'app
  reportPeriod: Period | null; // période demandée par « Afficher le rapport pour cette période »
  onOpenReport: (period: Period) => void;
  onAddDebt: (preset?: DebtPreset) => void;
  onEditDebts: (updates: { id: string; changes: Partial<Transaction> }[], message: string) => void;
  onDeleteDebts: (ids: string[], message: string) => void;
  onAddDebtInterest: (entry: DebtEntry, amount: number, currency: string) => void; // intérêts ajoutés à une dette normale
  onRemoveDebtInterest: (txId: string) => void;
  sharedDebts: SharedDebts; // dettes partagées avec d'autres comptes Wallo
  ristournes: Ristourne[];
  onCreateRistourne: (r: Omit<Ristourne, 'id' | 'payments'>) => string;
  onUpdateRistourne: (id: string, changes: Partial<Ristourne>) => void;
  onDeleteRistourne: (id: string) => void;
  onPayRistourne: (r: Ristourne, m: RistourneMember, turn: number, walletId: string | null) => void;
  onUnpayRistourne: (r: Ristourne, paymentId: string) => void;
  onConfirmRistournePayment: (r: Ristourne, paymentId: string) => void;
  onReceiveRistourne: (r: Ristourne, turn: number, walletId: string) => void;
  onImport: (plan: ImportPlan, replace: boolean) => void;
  onRestore: (backup: Backup) => void;
  onOpenTutorial: () => void; // revoir le tutoriel de prise en main
}
