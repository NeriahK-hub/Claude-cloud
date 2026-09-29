import { Budget, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { BalanceInfo } from '../lib/money';
import { Backup, ImportPlan } from '../lib/importExport';
import type { Cloud } from '../lib/sync/useCloud';
import { HomeAction } from './BalanceSection';
import { Page } from './BottomNav';

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
  onTransfer: (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number) => void;
  onAdjustBalance: (walletId: string, newBalance: number) => void;
  onReorderWallets: (ids: string[]) => void;
  budgets: Budget[];
  onAddBudget: (b: Omit<Budget, 'id' | 'createdAt'>) => void;
  onUpdateBudget: (id: string, changes: Partial<Budget>) => void;
  onDeleteBudget: (id: string) => void;
  cloud: Cloud;
  onImport: (plan: ImportPlan, replace: boolean) => void;
  onRestore: (backup: Backup) => void;
}
