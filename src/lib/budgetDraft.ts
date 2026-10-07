// Budget pré-rempli demandé depuis un conseil (Santé financière › « Créer un budget ») :
// l'écran Budgets le prend à l'ouverture et ouvre directement la fiche remplie.

export interface BudgetDraft {
  categoryId: string;
  amount: number; // dans la devise principale
}

let draft: BudgetDraft | null = null;

export const setBudgetDraft = (d: BudgetDraft | null) => {
  draft = d;
};

// Lu à l'ouverture de l'écran Budgets, puis effacé une fois affiché (clearBudgetDraft)
export const peekBudgetDraft = (): BudgetDraft | null => draft;
export const clearBudgetDraft = () => {
  draft = null;
};

// Montant facile à lire : arrondi au-dessus (5, 10, 50…)
export const niceBudget = (v: number) => {
  const step = v >= 1000 ? 50 : v >= 100 ? 10 : v >= 20 ? 5 : 1;
  return Math.max(step, Math.ceil(v / step) * step);
};
