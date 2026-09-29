import { Budget, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { convertBetween, countsInStats, toMain } from './money';
import { inPeriod, periodRange } from './periods';

export const monthRange = (offset = 0, now = new Date()) => periodRange({ kind: 'month', offset }, now);

// La dépense compte pour le budget si sa catégorie est celle du budget ou une de ses sous-catégories
function matches(b: Budget, t: Transaction, categories: Category[]) {
  if (b.categoryId === null) return true;
  if (t.categoryId === b.categoryId) return true;
  return categories.find((c) => c.id === t.categoryId)?.parentId === b.categoryId;
}

export interface BudgetStatus {
  spent: number; // dans la devise du budget
  ratio: number; // 0.5 = moitié utilisée
  left: number; // négatif = dépassé
  txs: Transaction[];
}

// Dépenses réelles (hors transferts, ajustements et opérations exclues du rapport) sur le mois donné
export function budgetStatus(
  b: Budget,
  transactions: Transaction[],
  categories: Category[],
  settings: Settings,
  offset = 0,
  now = new Date()
): BudgetStatus {
  const range = monthRange(offset, now);
  const txs = transactions.filter((t) => t.amount < 0 && countsInStats(t) && inPeriod(t.createdAt, range) && matches(b, t, categories));
  const spentMain = txs.reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const spent = convertBetween(spentMain, settings.mainCurrency, b.currency, settings) ?? spentMain;
  return { spent, ratio: b.amount > 0 ? spent / b.amount : 0, left: b.amount - spent, txs };
}

// Moyenne des dépenses des mois précédents (pour proposer un montant)
export function pastSpending(
  categoryId: string | null,
  transactions: Transaction[],
  categories: Category[],
  settings: Settings,
  months = 3
): { last: number; average: number } {
  const probe: Budget = { id: '', categoryId, amount: 0, currency: settings.mainCurrency, createdAt: '' };
  const values = Array.from({ length: months }, (_, i) => budgetStatus(probe, transactions, categories, settings, -(i + 1)).spent);
  const used = values.filter((v) => v > 0);
  return { last: values[0], average: used.length ? used.reduce((s, v) => s + v, 0) / used.length : 0 };
}

// Couleur de la barre : vert, orange à 80 %, rouge au-delà
export const budgetTone = (ratio: number) => (ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500');

// Un montant « rond » proche de la moyenne (ex. 47 380 -> 50 000)
export function roundBudget(v: number): number {
  if (v <= 0) return 0;
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.ceil(v / step) * step;
}
