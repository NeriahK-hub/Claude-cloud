import { Settings, Transaction } from '../types';
import { isSpending } from './review';
import { smallLimit } from './review';
import { toMain } from './money';

// Dépense inhabituelle : bien plus chère que d'habitude dans sa catégorie.
// Il faut au moins 5 dépenses de la même catégorie sur les 4 mois d'avant, et un montant qui n'est pas minuscule.
const DAY = 86400000;

export interface Unusual {
  tx: Transaction;
  usual: number; // montant habituel (médiane), devise principale
  amount: number; // devise principale
  times: number; // « 4 fois plus »
}

export function unusualExpenses(transactions: Transaction[], settings: Settings, now = new Date(), withinDays = 2): Unusual[] {
  const out: Unusual[] = [];
  const recent = transactions.filter((t) => isSpending(t) && t.categoryId && now.getTime() - new Date(t.createdAt).getTime() <= withinDays * DAY && new Date(t.createdAt).getTime() <= now.getTime());
  for (const tx of recent) {
    const at = new Date(tx.createdAt).getTime();
    const amount = -toMain(tx.amount, tx.currency, settings);
    if (amount < smallLimit(settings) * 2) continue; // pas pour les petites sommes
    const past = transactions
      .filter((t) => t.id !== tx.id && t.categoryId === tx.categoryId && isSpending(t) && new Date(t.createdAt).getTime() < at && at - new Date(t.createdAt).getTime() <= 120 * DAY)
      .map((t) => -toMain(t.amount, t.currency, settings))
      .sort((a, b) => a - b);
    if (past.length < 5) continue;
    const usual = past[Math.floor(past.length / 2)];
    if (usual > 0 && amount >= usual * 3) out.push({ tx, usual, amount, times: Math.round(amount / usual) });
  }
  return out;
}
