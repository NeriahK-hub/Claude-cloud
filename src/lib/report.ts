// Soldes d'une période, en devise principale : à l'ouverture, à la fin, et maintenant.
// Partagé par le Rapport (Stats) et l'onglet Transactions.
import { Settings, Transaction, Wallet } from '../types';
import { toMain } from './money';
import { Period, periodRange } from './periods';

// Portefeuilles concernés : celui choisi, ou tous ceux comptés dans le total
export const reportScope = (wallets: Wallet[], wallet: Wallet | null) =>
  wallet ? [wallet] : wallets.filter((w) => w.includeInTotal && !w.archived);

export function periodBalances(allTransactions: Transaction[], scope: Wallet[], period: Period, settings: Settings) {
  const ids = new Set(scope.map((w) => w.id));
  const txs = allTransactions.filter((t) => ids.has(t.walletId));
  const initial = scope.reduce((s, w) => s + toMain(w.initialBalance, w.currency, settings), 0);
  const balanceAt = (d: Date | null) =>
    initial + txs.filter((t) => !d || new Date(t.createdAt) < d).reduce((s, t) => s + toMain(t.amount, t.currency, settings), 0);
  const range = periodRange(period);
  const now = new Date();
  const end = range.end && range.end < now ? range.end : null; // période en cours : solde actuel
  return {
    opening: range.start ? balanceAt(range.start) : initial,
    closing: balanceAt(end),
    current: balanceAt(null),
  };
}
