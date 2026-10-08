import { Recurring, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { countsInStats, toMain } from './money';
import { isDebtTransaction } from './debts';
import { CatTotal, dayKey, topOf } from './insights';

// « Comprendre son argent » : bilan de la semaine, bilan de l'année, quand tu dépenses,
// petites dépenses qui coûtent cher, abonnements repérés. Tout en devise principale.

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const shift = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Vraies dépenses : pas les transferts, ni les dettes / prêts, ni ce qui est exclu du rapport
export const isSpending = (t: Transaction) => t.amount < 0 && t.type !== 'transfer' && !isDebtTransaction(t) && countsInStats(t);
export const isIncome = (t: Transaction) => t.amount > 0 && t.type !== 'transfer' && !isDebtTransaction(t) && countsInStats(t);

const inRange = (t: Transaction, start: Date, end: Date) => {
  const x = new Date(t.createdAt).getTime();
  return x >= start.getTime() && x < end.getTime();
};

function catTotals(list: Transaction[], categories: Category[], settings: Settings): CatTotal[] {
  const m = new Map<string, CatTotal>();
  for (const t of list) {
    const c = topOf(t, categories);
    const cur = m.get(c.id) ?? c;
    cur.amount -= toMain(t.amount, t.currency, settings);
    m.set(c.id, cur);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

// ---------- Bilan de la semaine ----------
export function weekBounds(weekStart: number, offset = 0, now = new Date()) {
  const today = startOfDay(now);
  const back = (today.getDay() - weekStart + 7) % 7;
  const start = shift(today, -back + offset * 7);
  return { start, end: shift(start, 7) };
}

export interface WeekReview {
  start: Date;
  end: Date; // exclu
  spent: number;
  received: number;
  prevSpent: number;
  count: number;
  days: { date: Date; amount: number; future: boolean }[]; // 7 jours
  topDay: { date: Date; amount: number } | null;
  freeDays: number; // jours passés sans dépense
  cats: CatTotal[];
  biggest: Transaction | null;
}

export function weekReview(txs: Transaction[], settings: Settings, categories: Category[], weekStart: number, offset = 0, now = new Date()): WeekReview {
  const { start, end } = weekBounds(weekStart, offset, now);
  const prev = weekBounds(weekStart, offset - 1, now);
  const week = txs.filter((t) => inRange(t, start, end));
  const out = week.filter(isSpending);
  const spent = out.reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const received = week.filter(isIncome).reduce((s, t) => s + toMain(t.amount, t.currency, settings), 0);
  const prevSpent = txs.filter((t) => isSpending(t) && inRange(t, prev.start, prev.end)).reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const today = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = shift(start, i);
    const k = dayKey(date);
    const amount = out.filter((t) => dayKey(new Date(t.createdAt)) === k).reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
    return { date, amount, future: date.getTime() > today.getTime() };
  });
  const topDay = days.reduce<{ date: Date; amount: number } | null>((b, d) => (d.amount > (b?.amount ?? 0) ? d : b), null);
  const freeDays = days.filter((d) => !d.future && d.date.getTime() < today.getTime() && d.amount === 0).length;
  const biggest = out.reduce<Transaction | null>((b, t) => (!b || toMain(t.amount, t.currency, settings) < toMain(b.amount, b.currency, settings) ? t : b), null);
  return { start, end, spent, received, prevSpent, count: week.length, days, topDay, freeDays, cats: catTotals(out, categories, settings), biggest };
}

// ---------- Bilan de l'année ----------
export interface YearReview {
  year: number;
  income: number;
  expense: number;
  count: number;
  notedDays: number;
  freeDays: number;
  longest: number; // plus longue série de jours notés dans l'année
  months: { m: number; income: number; expense: number }[];
  cats: CatTotal[];
  biggest: Transaction | null;
  topMonth: number | null; // mois le plus cher
  bestMonth: number | null; // mois où il est resté le plus (revenus − dépenses)
}

export function yearReview(txs: Transaction[], settings: Settings, categories: Category[], year: number, now = new Date()): YearReview {
  const list = txs.filter((t) => new Date(t.createdAt).getFullYear() === year && new Date(t.createdAt).getTime() <= now.getTime());
  const out = list.filter(isSpending);
  const months = Array.from({ length: 12 }, (_, m) => ({ m, income: 0, expense: 0 }));
  for (const t of list) {
    const m = new Date(t.createdAt).getMonth();
    if (isSpending(t)) months[m].expense -= toMain(t.amount, t.currency, settings);
    else if (isIncome(t)) months[m].income += toMain(t.amount, t.currency, settings);
  }
  const income = months.reduce((s, x) => s + x.income, 0);
  const expense = months.reduce((s, x) => s + x.expense, 0);
  const noted = new Set(list.map((t) => dayKey(new Date(t.createdAt))));
  const spendDays = new Set(out.map((t) => dayKey(new Date(t.createdAt))));
  // Jours sans dépense : depuis la première opération de l'année jusqu'à hier (ou au 31 décembre)
  const first = list.length ? startOfDay(new Date(Math.min(...list.map((t) => new Date(t.createdAt).getTime())))) : null;
  const last = year < now.getFullYear() ? new Date(year + 1, 0, 1) : startOfDay(now);
  let freeDays = 0;
  if (first) for (let d = first; d.getTime() < last.getTime(); d = shift(d, 1)) if (!spendDays.has(dayKey(d))) freeDays++;
  // Plus longue série
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of [...noted].sort()) {
    const x = new Date(k + 'T00:00').getTime();
    run = prev !== null && Math.round((x - prev) / DAY) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = x;
  }
  const used = months.filter((x) => x.income > 0 || x.expense > 0);
  const topMonth = used.length ? used.reduce((a, b) => (b.expense > a.expense ? b : a)).m : null;
  const bestMonth = used.filter((x) => x.income > 0).length ? used.filter((x) => x.income > 0).reduce((a, b) => (b.income - b.expense > a.income - a.expense ? b : a)).m : null;
  const biggest = out.reduce<Transaction | null>((b, t) => (!b || toMain(t.amount, t.currency, settings) < toMain(b.amount, b.currency, settings) ? t : b), null);
  return { year, income, expense, count: list.length, notedDays: noted.size, freeDays, longest, months, cats: catTotals(out, categories, settings), biggest, topMonth, bestMonth };
}

// ---------- Quand tu dépenses (jour de la semaine, moment de la journée) ----------
export const DAY_PARTS = [
  { id: 'morning', label: 'Le matin', hint: '5 h – 12 h', from: 5, to: 12 },
  { id: 'afternoon', label: 'L’après-midi', hint: '12 h – 18 h', from: 12, to: 18 },
  { id: 'evening', label: 'Le soir', hint: '18 h – 23 h', from: 18, to: 23 },
  { id: 'night', label: 'La nuit', hint: '23 h – 5 h', from: 23, to: 5 },
] as const;

export function whenYouSpend(txs: Transaction[], settings: Settings, days = 90, now = new Date()) {
  const from = now.getTime() - days * DAY;
  const out = txs.filter((t) => isSpending(t) && new Date(t.createdAt).getTime() > from && new Date(t.createdAt).getTime() <= now.getTime());
  // Par jour de la semaine (0 = dimanche) : total et nombre de ces jours dans la période
  const weekday = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  for (const t of out) weekday[new Date(t.createdAt).getDay()].total -= toMain(t.amount, t.currency, settings);
  for (let d = startOfDay(new Date(from)); d.getTime() <= now.getTime(); d = shift(d, 1)) weekday[d.getDay()].count++;
  const perWeekday = weekday.map((w) => (w.count ? w.total / w.count : 0));
  // Moment de la journée : on ignore les heures « rondes » des imports (minuit pile, midi pile)
  const timed = out.filter((t) => {
    const d = new Date(t.createdAt);
    return !((d.getHours() === 0 || d.getHours() === 12) && d.getMinutes() === 0 && d.getSeconds() === 0);
  });
  const parts = DAY_PARTS.map((p) => {
    const list = timed.filter((t) => {
      const h = new Date(t.createdAt).getHours();
      return p.from < p.to ? h >= p.from && h < p.to : h >= p.from || h < p.to;
    });
    return { ...p, total: list.reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0), count: list.length };
  });
  const total = out.reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  return { perWeekday, parts, timedCount: timed.length, count: out.length, total };
}

// ---------- Petites dépenses qui coûtent cher ----------
// « Petite » : moins de 5 $ (ou l'équivalent dans la devise principale)
export function smallLimit(settings: Settings): number {
  if (settings.mainCurrency === 'USD') return 5;
  const usd = settings.rates.USD;
  if (usd) return Math.round(5 * usd);
  return settings.mainCurrency === 'CDF' ? 15000 : 5;
}

export function smallExpenses(txs: Transaction[], settings: Settings, categories: Category[], days = 30, now = new Date()) {
  const limit = smallLimit(settings);
  const from = now.getTime() - days * DAY;
  const out = txs.filter((t) => isSpending(t) && new Date(t.createdAt).getTime() > from && new Date(t.createdAt).getTime() <= now.getTime());
  const small = out.filter((t) => -toMain(t.amount, t.currency, settings) < limit);
  const total = small.reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const all = out.reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  return { limit, count: small.length, total, share: all > 0 ? total / all : 0, yearly: total * (365 / days), perDay: total / days, cats: catTotals(small, categories, settings).slice(0, 4) };
}

// ---------- Abonnements repérés ----------
// Une dépense avec le même nom, un montant presque pareil, environ une fois par mois, sur au moins 3 mois.
export interface Subscription {
  key: string;
  name: string;
  amount: number; // devise principale, moyenne
  color: string;
  icon: string;
  image?: string;
  count: number;
  last: Date;
  next: Date;
  yearly: number;
  known: boolean; // déjà dans « À venir »
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function findSubscriptions(txs: Transaction[], settings: Settings, categories: Category[], recurrings: Recurring[] = [], now = new Date()): Subscription[] {
  const from = now.getTime() - 200 * DAY;
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (!isSpending(t) || new Date(t.createdAt).getTime() < from) continue;
    // Il faut un vrai nom (« Canal+ », « Loyer ») : pas juste le nom de la catégorie
    const k = norm(t.title);
    if (!k || k === norm(t.category)) continue;
    // Un groupe par portefeuille : le même nom noté dans un autre portefeuille ne doit pas casser le rythme
    const gk = `${t.walletId}|${k}`;
    const g = groups.get(gk) ?? [];
    g.push(t);
    groups.set(gk, g);
  }
  const knownNames = new Set(recurrings.map((r) => norm(r.title)));
  const out: Subscription[] = [];
  for (const [gk, list] of groups) {
    const k = gk.slice(gk.indexOf('|') + 1);
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const months = new Set(sorted.map((t) => t.createdAt.slice(0, 7)));
    if (months.size < 3) continue;
    const amounts = sorted.map((t) => -toMain(t.amount, t.currency, settings));
    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    if (amounts.some((v) => Math.abs(v - avg) > avg * 0.15)) continue; // montant qui varie trop
    const gaps = sorted.slice(1).map((t, i) => (new Date(t.createdAt).getTime() - new Date(sorted[i].createdAt).getTime()) / DAY);
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    if (median < 24 || median > 38) continue; // pas « une fois par mois »
    const last = new Date(sorted[sorted.length - 1].createdAt);
    if (now.getTime() - last.getTime() > 60 * DAY) continue; // arrêté
    const c = topOf(sorted[sorted.length - 1], categories);
    out.push({
      key: gk,
      name: sorted[sorted.length - 1].title.trim() || c.name,
      amount: avg,
      color: c.color,
      icon: c.icon,
      image: c.image,
      count: sorted.length,
      last,
      next: new Date(last.getTime() + Math.round(median) * DAY),
      yearly: avg * 12,
      known: knownNames.has(k),
    });
  }
  return out.sort((a, b) => b.yearly - a.yearly);
}
