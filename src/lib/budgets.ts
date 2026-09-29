import { Budget, BudgetPeriod, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { convertBetween, countsInStats, toMain } from './money';
import { inPeriod, periodRange } from './periods';
import { formatDate } from './display';

export const monthRange = (offset = 0, now = new Date()) => periodRange({ kind: 'month', offset }, now);

export const PERIODS: { id: BudgetPeriod; now: string; every: string; per: string }[] = [
  { id: 'week', now: 'Cette semaine', every: 'Chaque semaine', per: 'par semaine' },
  { id: 'month', now: 'Ce mois-ci', every: 'Chaque mois', per: 'par mois' },
  { id: 'quarter', now: 'Ce trimestre', every: 'Chaque trimestre', per: 'par trimestre' },
  { id: 'year', now: 'Cette année', every: 'Chaque année', per: 'par an' },
  { id: 'custom', now: 'Personnalisé', every: 'Personnalisé', per: '' },
];

export const periodOf = (b: Pick<Budget, 'period'>): BudgetPeriod => b.period ?? 'month';

// Début (inclus) / fin (exclue) du budget pour la période demandée (0 = en cours, -1 = précédente…)
export function budgetRange(b: Pick<Budget, 'period' | 'from' | 'to'>, offset = 0, now = new Date()): { start: Date; end: Date } {
  const kind = periodOf(b);
  if (kind === 'custom') {
    const start = new Date((b.from ?? '1970-01-01') + 'T00:00');
    const end = new Date((b.to ?? b.from ?? '1970-01-01') + 'T00:00');
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  return periodRange({ kind, offset }, now) as { start: Date; end: Date };
}

// « 28/09 – 04/10 »
export function rangeText(r: { start: Date; end: Date }) {
  return `${formatDate(r.start, true)} – ${formatDate(new Date(r.end.getTime() - 86400000), true)}`;
}

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
  start: Date;
  end: Date;
}

// Dépenses réelles (hors transferts, ajustements et opérations exclues du rapport) sur la période
export function budgetStatus(
  b: Budget,
  transactions: Transaction[],
  categories: Category[],
  settings: Settings,
  offset = 0,
  now = new Date()
): BudgetStatus {
  const range = budgetRange(b, offset, now);
  const txs = transactions.filter((t) => t.amount < 0 && countsInStats(t) && inPeriod(t.createdAt, range) && matches(b, t, categories));
  const spentMain = txs.reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const spent = convertBetween(spentMain, settings.mainCurrency, b.currency, settings) ?? spentMain;
  return { spent, ratio: b.amount > 0 ? spent / b.amount : 0, left: b.amount - spent, txs, ...range };
}

// Ce qu'on a dépensé avant, pour proposer un montant :
// les périodes précédentes (même durée) ; pour un budget personnalisé, les 90 derniers jours ramenés à sa durée.
export function pastSpending(
  categoryId: string | null,
  transactions: Transaction[],
  categories: Category[],
  settings: Settings,
  period: BudgetPeriod = 'month',
  custom?: { from?: string; to?: string }
): { last: number; average: number } {
  const probe: Budget = { id: '', categoryId, amount: 0, currency: settings.mainCurrency, createdAt: '', period };
  if (period === 'custom') {
    if (!custom?.from || !custom.to) return { last: 0, average: 0 };
    const r = budgetRange({ period: 'custom', ...custom });
    const days = Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 86400000));
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 86400000);
    const spent = budgetStatus({ ...probe, from: iso(start), to: iso(end) }, transactions, categories, settings).spent;
    const v = (spent / 90) * days;
    return { last: 0, average: v };
  }
  const values = [1, 2, 3].map((i) => budgetStatus(probe, transactions, categories, settings, -i).spent);
  const used = values.filter((v) => v > 0);
  return { last: values[0], average: used.length ? used.reduce((s, v) => s + v, 0) / used.length : 0 };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Couleur de la barre : vert, orange à 80 %, rouge au-delà
export const budgetTone = (ratio: number) => (ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500');

// Un montant « rond » proche de la moyenne (ex. 47 380 -> 50 000)
export function roundBudget(v: number): number {
  if (v <= 0) return 0;
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.ceil(v / step) * step;
}
