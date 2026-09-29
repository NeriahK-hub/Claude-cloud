// Dettes et prêts, regroupés par personne.
// On s'appuie sur les 4 catégories Dette / Prêt de l'app :
//   Prêt accordé (je prête)          -> on me doit +
//   Prêt remboursé (on me rembourse) -> on me doit −
//   Dette contractée (j'emprunte)    -> je dois +
//   Remboursement de dette (je rends)-> je dois −
import { Settings, Transaction } from '../types';
import { toMain } from './money';

export type DebtSide = 'receivable' | 'payable'; // on me doit / je dois

const KINDS: Record<string, { side: DebtSide; grows: boolean }> = {
  'loan-given': { side: 'receivable', grows: true },
  'loan-back': { side: 'receivable', grows: false },
  'debt-taken': { side: 'payable', grows: true },
  'debt-repay': { side: 'payable', grows: false },
};

export const isDebtTransaction = (t: Transaction) => !!t.categoryId && t.categoryId in KINDS;

// Catégorie à utiliser pour un nouveau mouvement
export const DEBT_CATEGORY = {
  receivable: { more: 'loan-given', repay: 'loan-back' },
  payable: { more: 'debt-taken', repay: 'debt-repay' },
} as const;

export interface DebtEntry {
  key: string;
  name: string; // « Sans nom » si on ne sait pas
  side: DebtSide;
  total: number; // prêté (ou emprunté), en devise principale
  paid: number; // remboursé
  left: number; // reste (négatif = trop remboursé)
  txs: Transaction[];
  last: string; // date du dernier mouvement
}

export const NO_NAME = 'Sans nom';
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Retrouve la personne d'un mouvement sans « Avec » à partir de sa note
// (« Paiement reçu de Kemy Avongo » -> Kemy Avongo ; « Prêt à DM » -> DM fablab)
function guessPerson(title: string, known: string[]): string | null {
  const text = ` ${norm(title)} `;
  let best: string | null = null;
  for (const name of known) {
    const n = norm(name);
    const first = n.split(' ')[0];
    const hit = text.includes(` ${n} `) || (first.length >= 2 && text.includes(` ${first} `));
    if (hit && (!best || n.length > norm(best).length)) best = name;
  }
  return best;
}

export function personOf(t: Transaction): string | undefined {
  return t.withPerson?.trim() || undefined;
}

export function debtsSummary(transactions: Transaction[], settings: Settings): DebtEntry[] {
  const txs = transactions.filter(isDebtTransaction);
  // Noms connus (avec la casse la plus fréquente)
  const known = [...new Set(txs.map(personOf).filter((x): x is string => !!x))];
  const map = new Map<string, DebtEntry>();
  for (const t of txs) {
    const kind = KINDS[t.categoryId!];
    const name = personOf(t) ?? guessPerson(t.title, known) ?? NO_NAME;
    const key = `${kind.side}|${norm(name)}`;
    const e = map.get(key) ?? { key, name, side: kind.side, total: 0, paid: 0, left: 0, txs: [], last: t.createdAt };
    const v = Math.abs(toMain(t.amount, t.currency, settings));
    if (kind.grows) e.total += v;
    else e.paid += v;
    e.left = Math.round((e.total - e.paid) * 100) / 100;
    e.txs.push(t);
    if (t.createdAt > e.last) e.last = t.createdAt;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.left - a.left || b.last.localeCompare(a.last));
}
