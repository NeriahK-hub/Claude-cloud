// Dettes et prêts, regroupés par personne.
// On s'appuie sur les 4 catégories Dette / Prêt de l'app :
//   Prêt accordé (je prête)          -> on me doit +
//   Prêt remboursé (on me rembourse) -> on me doit −
//   Dette contractée (j'emprunte)    -> je dois +
//   Remboursement de dette (je rends)-> je dois −
import { DebtShare, Settings, Transaction } from '../types';
import { convertBetween, toMain } from './money';
import { shareTotals, waitingForMe } from './debtShares';

export type DebtSide = 'receivable' | 'payable'; // on me doit / je dois

const KINDS: Record<string, { side: DebtSide; grows: boolean }> = {
  'loan-given': { side: 'receivable', grows: true },
  'loan-back': { side: 'receivable', grows: false },
  'debt-taken': { side: 'payable', grows: true },
  'debt-repay': { side: 'payable', grows: false },
};

export const isDebtTransaction = (t: Transaction) => !!t.categoryId && t.categoryId in KINDS;

// Côté et sens d'une catégorie Dette / Prêt (null : autre catégorie)
export function debtKindOf(categoryId?: string): { side: DebtSide; kind: 'more' | 'repay' } | null {
  const k = categoryId ? KINDS[categoryId] : undefined;
  return k ? { side: k.side, kind: k.grows ? 'more' : 'repay' } : null;
}

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
  interest: number; // intérêts prévus, en devise principale
  paid: number; // remboursé
  left: number; // reste = prêté + intérêts − remboursé (négatif = trop remboursé)
  txs: Transaction[]; // opérations du tour en cours
  pastTxs?: Transaction[]; // tours déjà réglés (historique replié)
  last: string; // date du dernier mouvement
  share?: DebtShare; // dette partagée avec la personne (les montants viennent du carnet commun)
  currency?: string; // devise des montants : celle de la dette partagée, ou celle choisie à la saisie si toutes ses opérations l'ont (sinon : devise principale)
  waiting?: number; // partagée : mouvements de l'autre qui attendent ma réponse
  due?: string; // échéance la plus proche des prêts / emprunts du tour (AAAA-MM-JJ)
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

// Clé d'une personne (un côté) : « Kemy », « kémy » et « KEMY » sont la même personne
export const debtKey = (side: DebtSide, name: string) => `${side}|${norm(name)}`;
export const samePerson = (a: string, b: string) => norm(a) === norm(b);

export function personOf(t: Transaction): string | undefined {
  return t.withPerson?.trim() || undefined;
}

// Une dette se règle par « tours » : quand tout est remboursé, le tour est fermé et un nouveau prêt
// repart de zéro (un trop-remboursé n'est pas reporté). Renvoie le tour en cours et les tours réglés.
// delta : + pour ce qui fait grandir la dette (prêt, intérêts), − pour un remboursement.
export function currentRound<T>(items: T[], date: (x: T) => string, delta: (x: T) => number): { current: T[]; past: T[] } {
  // À la même date, le prêt avant le remboursement
  const sorted = [...items].sort((a, b) => date(a).localeCompare(date(b)) || delta(b) - delta(a));
  let balance = 0;
  let start = 0;
  sorted.forEach((x, i) => {
    const d = delta(x);
    if (i > 0 && d > 0 && balance <= 0.004) {
      start = i; // tout était réglé : nouveau tour
      balance = 0;
    }
    balance += d;
  });
  return { current: sorted.slice(start), past: sorted.slice(0, start) };
}

export function debtsSummary(transactions: Transaction[], settings: Settings, shares: DebtShare[] = [], me = ''): DebtEntry[] {
  const txs = transactions.filter(isDebtTransaction);
  // Noms connus (avec la casse la plus fréquente)
  const known = [...new Set(txs.map(personOf).filter((x): x is string => !!x))];
  const byKey = new Map<string, { name: string; side: DebtSide; txs: Transaction[] }>();
  for (const t of txs) {
    const kind = KINDS[t.categoryId!];
    const name = personOf(t) ?? guessPerson(t.title, known) ?? NO_NAME;
    const key = debtKey(kind.side, name);
    const g = byKey.get(key) ?? { name, side: kind.side, txs: [] };
    g.txs.push(t);
    byKey.set(key, g);
  }
  const main = (v: number, c: string) => Math.abs(toMain(v, c, settings));
  const grows = (t: Transaction) => KINDS[t.categoryId!].grows;
  const delta = (t: Transaction) => (grows(t) ? main(t.amount, t.currency) + (t.interest ? main(t.interest, t.currency) : 0) : -main(t.amount, t.currency));
  const map = new Map<string, DebtEntry>();
  for (const [key, g] of byKey) {
    const { current, past } = currentRound(g.txs, (t) => t.createdAt, delta);
    const e: DebtEntry = { key, name: g.name, side: g.side, total: 0, interest: 0, paid: 0, left: 0, txs: current, pastTxs: past, last: '' };
    // Devise de la dette : celle choisie à la saisie du prêt / de l'emprunt (ex. 30 $ prêtés depuis un
    // portefeuille en CDF), si tous ceux du tour l'ont ; les remboursements y sont convertis.
    // Sinon tout est ramené à la devise principale
    const opening = current.filter(grows);
    const typed = [...new Set((opening.length ? opening : current).map((t) => t.originalCurrency ?? t.currency))];
    const cur = typed.length === 1 && typed[0] !== settings.mainCurrency ? typed[0] : null;
    const value = (t: Transaction, v: number) => {
      if (!cur) return main(v, t.currency);
      if (t.originalCurrency === cur && t.originalAmount !== undefined && v === t.amount) return Math.abs(t.originalAmount);
      return Math.abs(convertBetween(v, t.currency, cur, settings) ?? toMain(v, t.currency, settings));
    };
    if (cur) e.currency = cur;
    const dues = opening.map((t) => t.dueDate).filter((d): d is string => !!d).sort();
    if (dues.length) e.due = dues[0];
    for (const t of current) {
      if (grows(t)) {
        e.total += value(t, t.amount);
        if (t.interest) e.interest += value(t, t.interest);
      } else e.paid += value(t, t.amount);
      if (t.createdAt > e.last) e.last = t.createdAt;
    }
    e.left = Math.round((e.total + e.interest - e.paid) * 100) / 100;
    map.set(key, e);
  }
  // Dette partagée : le carnet commun remplace les opérations de mes portefeuilles pour cette personne
  for (const sh of shares) {
    const key = debtKey(sh.side, sh.person);
    const t = shareTotals(sh, settings);
    const last = t.current.reduce((m, x) => (x.date > m ? x.date : m), '');
    map.set(key, { key, name: sh.person, side: sh.side, total: t.total, interest: t.interest, paid: t.paid, left: t.left, currency: t.currency, txs: [], last, share: sh, waiting: waitingForMe(sh, me) });
  }
  // Tri sur le reste ramené à la devise principale (une dette peut garder sa propre devise)
  const inMain = (e: DebtEntry) => (e.currency ? toMain(e.left, e.currency, settings) : e.left);
  return [...map.values()].sort((a, b) => inMain(b) - inMain(a) || b.last.localeCompare(a.last));
}

// Échéance d'une dette encore ouverte : 'late' (passée), 'today', 'soon' (demain), sinon null
export function dueLevel(e: DebtEntry, now = new Date()): 'late' | 'today' | 'soon' | null {
  if (!e.due || e.left <= 0.004) return null;
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = day(now);
  const tomorrow = day(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  return e.due < today ? 'late' : e.due === today ? 'today' : e.due === tomorrow ? 'soon' : null;
}
