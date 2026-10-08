import { Budget, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { budgetRange, budgetStatus, existedIn, periodOf, roundBudget } from './budgets';
import { formatDate } from './display';

// Budgets conseillés et historique des budgets tenus.

export interface BudgetSuggestion {
  categoryId: string;
  average: number; // dépense moyenne par mois (devise principale)
  amount: number; // budget proposé : un peu en dessous de l'habitude
}

// Catégories sans budget mensuel où l'on dépense régulièrement : un budget proposé d'après les 3 derniers mois
export function suggestBudgets(transactions: Transaction[], categories: Category[], settings: Settings, budgets: Budget[], limit = 4): BudgetSuggestion[] {
  const have = new Set(budgets.filter((b) => periodOf(b) === 'month').map((b) => b.categoryId));
  const out: BudgetSuggestion[] = [];
  for (const c of categories.filter((x) => x.type === 'expense' && !x.parentId && !have.has(x.id))) {
    const probe: Budget = { id: '', categoryId: c.id, amount: 0, currency: settings.mainCurrency, createdAt: '', period: 'month' };
    const values = [1, 2, 3].map((i) => budgetStatus(probe, transactions, categories, settings, -i).spent).filter((v) => v > 0);
    if (values.length < 2) continue; // il faut au moins 2 mois de dépenses pour parler d'habitude
    const average = values.reduce((s, v) => s + v, 0) / values.length;
    out.push({ categoryId: c.id, average, amount: roundBudget(average * 0.9) });
  }
  return out.sort((a, b) => b.average - a.average).slice(0, limit);
}

export interface HistoryCell {
  offset: number;
  label: string;
  ratio: number | null; // null = le budget n'existait pas encore
}

// Les n dernières périodes d'un budget (la plus ancienne d'abord) : part du budget utilisée
export function budgetHistory(b: Budget, transactions: Transaction[], categories: Category[], settings: Settings, n = 6): HistoryCell[] {
  if (periodOf(b) === 'custom') return [];
  const cells: HistoryCell[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const range = budgetRange(b, -i);
    const label = periodOf(b) === 'month' ? range.start.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : formatDate(range.start, true);
    cells.push({ offset: -i, label, ratio: existedIn(b, range) ? budgetStatus(b, transactions, categories, settings, -i).ratio : null });
  }
  return cells;
}
