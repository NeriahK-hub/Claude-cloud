import { Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { toMain } from './money';
import { isDebtTransaction } from './debts';

// Analyses du Rapport (calendrier, comparaison de deux mois, « Où part mon argent ? »).
// Les opérations reçues sont déjà celles qui comptent dans le rapport (portefeuille choisi).

const DAY = 86400000;
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const monthName = (y: number, m: number) => {
  const s = new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const shortMonth = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');

export interface CatTotal {
  id: string;
  name: string;
  color: string;
  icon: string;
  image?: string;
  amount: number;
}

// Catégorie principale d'une opération (les sous-catégories comptent dans leur parent)
export function topOf(t: Transaction, categories: Category[]): CatTotal {
  const c = categories.find((x) => x.id === t.categoryId);
  const top = c?.parentId ? categories.find((x) => x.id === c.parentId) ?? c : c;
  return {
    id: top?.id ?? t.category,
    name: top?.name ?? t.category,
    color: top?.color ?? t.color,
    icon: top?.icon ?? (t.avatarType === 'icon' ? t.avatarValue : 'Tag'),
    image: top?.image,
    amount: 0,
  };
}

// ---------- Calendrier : dépenses jour par jour d'un mois ----------
export function monthDays(txs: Transaction[], settings: Settings, year: number, month: number) {
  const days = new Map<string, { amount: number; txs: Transaction[] }>();
  for (const t of txs) {
    if (t.amount >= 0) continue;
    const d = new Date(t.createdAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const k = dayKey(d);
    const cur = days.get(k) ?? { amount: 0, txs: [] };
    cur.amount -= toMain(t.amount, t.currency, settings);
    cur.txs.push(t);
    days.set(k, cur);
  }
  const count = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const lastDay = year === today.getFullYear() && month === today.getMonth() ? today.getDate() : year * 12 + month > today.getFullYear() * 12 + today.getMonth() ? 0 : count;
  const values = [...days.values()].map((d) => d.amount);
  const total = values.reduce((s, v) => s + v, 0);
  let maxKey = '';
  for (const [k, v] of days) if (!maxKey || v.amount > days.get(maxKey)!.amount) maxKey = k;
  // Jours sans dépense : seulement les journées finies (aujourd'hui ne compte pas tant qu'il n'est pas fini)
  const isCurrent = year === today.getFullYear() && month === today.getMonth();
  const todaySpent = isCurrent && days.has(dayKey(today));
  const free = Math.max(0, lastDay - days.size - (isCurrent && !todaySpent ? 1 : 0));
  // Journées finies (pour « 4 jours sur 6 ») : aujourd'hui ne compte que s'il a déjà une dépense
  const doneDays = lastDay - (isCurrent && !todaySpent ? 1 : 0);
  return { days, count, lastDay, total, max: Math.max(0, ...values), maxKey, average: lastDay ? total / lastDay : 0, free, doneDays };
}

// ---------- Comparer deux mois ----------
export function monthSummary(txs: Transaction[], settings: Settings, categories: Category[], year: number, month: number) {
  let income = 0;
  let expense = 0;
  const cats = new Map<string, CatTotal>();
  for (const t of txs) {
    const d = new Date(t.createdAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const v = toMain(t.amount, t.currency, settings);
    if (v > 0) income += v;
    else {
      expense -= v;
      const c = topOf(t, categories);
      const cur = cats.get(c.id) ?? c;
      cur.amount -= v;
      cats.set(c.id, cur);
    }
  }
  return { income, expense, saved: income - expense, cats };
}

export function compareMonths(txs: Transaction[], settings: Settings, categories: Category[], a: { y: number; m: number }, b: { y: number; m: number }) {
  const A = monthSummary(txs, settings, categories, a.y, a.m);
  const B = monthSummary(txs, settings, categories, b.y, b.m);
  const ids = new Set([...A.cats.keys(), ...B.cats.keys()]);
  const rows = [...ids]
    .map((id) => {
      const ca = A.cats.get(id);
      const cb = B.cats.get(id);
      const base = (ca ?? cb)!;
      return { ...base, a: ca?.amount ?? 0, b: cb?.amount ?? 0, diff: (ca?.amount ?? 0) - (cb?.amount ?? 0) };
    })
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  // Ce qui explique le plus la différence
  const biggest = [...rows].sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))[0];
  return { A, B, rows, biggest };
}

// ---------- Où part mon argent : les dépenses qui reviennent le plus ----------
export interface Habit {
  id: string;
  name: string; // sous-catégorie, ou note la plus fréquente
  color: string;
  icon: string;
  image?: string;
  count: number; // sur 30 jours
  total: number; // sur 30 jours
  average: number;
  yearly: number;
  share: number; // part des dépenses du mois
}

export function habits(txs: Transaction[], settings: Settings, categories: Category[], now = new Date()) {
  const from = now.getTime() - 30 * DAY;
  const out = txs.filter((t) => t.amount < 0 && t.type !== 'transfer' && !isDebtTransaction(t) && new Date(t.createdAt).getTime() > from && new Date(t.createdAt).getTime() <= now.getTime());
  const total = out.reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const groups = new Map<string, { txs: Transaction[]; amount: number }>();
  for (const t of out) {
    const k = t.categoryId ?? t.category;
    const g = groups.get(k) ?? { txs: [], amount: 0 };
    g.txs.push(t);
    g.amount -= toMain(t.amount, t.currency, settings);
    groups.set(k, g);
  }
  const list: Habit[] = [...groups.entries()].map(([k, g]) => {
    const c = categories.find((x) => x.id === k);
    // Nom : la catégorie, ou la note qui revient le plus si elle est plus parlante (« Taxi Gombe »)
    const titles = new Map<string, number>();
    g.txs.forEach((t) => titles.set(t.title.trim(), (titles.get(t.title.trim()) ?? 0) + 1));
    const topTitle = [...titles.entries()].sort((a, b) => b[1] - a[1])[0];
    const name = topTitle && topTitle[1] >= Math.max(3, g.txs.length * 0.6) && topTitle[0] !== c?.name ? topTitle[0] : c?.name ?? g.txs[0].category;
    return {
      id: k,
      name,
      color: c?.color ?? g.txs[0].color,
      icon: c?.icon ?? (g.txs[0].avatarType === 'icon' ? g.txs[0].avatarValue : 'Tag'),
      image: c?.image,
      count: g.txs.length,
      total: g.amount,
      average: g.amount / g.txs.length,
      yearly: g.amount * (365 / 30),
      share: total > 0 ? g.amount / total : 0,
    };
  });
  // Habitudes : ce qui revient souvent (3 fois et plus), classé par coût
  const frequent = list.filter((h) => h.count >= 3).sort((a, b) => b.total - a.total);
  const byCategory = new Map<string, CatTotal>();
  for (const t of out) {
    const c = topOf(t, categories);
    const cur = byCategory.get(c.id) ?? c;
    cur.amount -= toMain(t.amount, t.currency, settings);
    byCategory.set(c.id, cur);
  }
  return { top: frequent.slice(0, 3), total, categories: [...byCategory.values()].sort((a, b) => b.amount - a.amount) };
}
