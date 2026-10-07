import { Budget, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { countsInStats, toMain } from './money';
import { budgetStatus, existedIn, periodOf } from './budgets';
import { DebtEntry } from './debts';
import { goalInsight } from './goals';
import { dayKey } from './insights';

// Séries et badges : tout se calcule à partir des opérations (rien à saisir).
// Un badge obtenu reste obtenu (date gardée sur le téléphone), même si on supprime l'objectif ensuite.

const DAY = 86400000;

// ---------- Série : jours de suite où tu as noté au moins une opération ----------
export interface Streak {
  current: number; // jours de suite jusqu'à aujourd'hui (ou hier si rien encore aujourd'hui)
  best: number; // record
  today: boolean; // déjà noté aujourd'hui ?
  week: { key: string; label: string; done: boolean; isToday: boolean; run: number }[]; // les 7 derniers jours
  runs: Map<string, number>; // jour noté -> sa place dans la série (1er jour, 2e jour…)
  first: string | null; // premier jour noté (avant : ni noté ni manqué)
}

// Couleurs de la flamme : elle change tous les 10 jours, puis par grands paliers
export interface FlameTier {
  from: number;
  to: number | null; // null = sans fin
  name: string;
  color: string;
}
export const FLAME_TIERS: FlameTier[] = [
  { from: 1, to: 10, name: 'Flamme orange', color: '#F97316' },
  { from: 11, to: 20, name: 'Flamme rouge', color: '#EF4444' },
  { from: 21, to: 30, name: 'Flamme rose', color: '#EC4899' },
  { from: 31, to: 60, name: 'Flamme violette', color: '#8B5CF6' },
  { from: 61, to: 100, name: 'Flamme bleue', color: '#3B82F6' },
  { from: 101, to: null, name: 'Flamme d\u2019or', color: '#EAB308' },
];
export const tierOf = (n: number): FlameTier | null => (n <= 0 ? null : FLAME_TIERS.find((t) => t.to === null || n <= t.to) ?? null);
export const nextTierOf = (n: number): FlameTier | null => FLAME_TIERS.find((t) => t.from > n) ?? null;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const shift = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function computeStreak(transactions: Transaction[], now = new Date()): Streak {
  const today = startOfDay(now);
  // Jours notés jusqu'à aujourd'hui (les opérations prévues dans le futur ne comptent pas)
  const days = new Set(transactions.map((t) => new Date(t.createdAt)).filter((d) => d.getTime() < shift(today, 1).getTime()).map((d) => dayKey(d)));
  const noted = days.has(dayKey(today));
  let current = 0;
  for (let d = noted ? today : shift(today, -1); days.has(dayKey(d)); d = shift(d, -1)) current++;

  // Place de chaque jour dans sa série, et record
  const sorted = [...days].sort();
  const runs = new Map<string, number>();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of sorted) {
    const d = new Date(k + 'T00:00');
    run = prev && Math.round((d.getTime() - prev.getTime()) / DAY) === 1 ? run + 1 : 1;
    runs.set(k, run);
    best = Math.max(best, run);
    prev = d;
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = shift(today, i - 6);
    const k = dayKey(d);
    const label = d.toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase();
    return { key: k, label, done: days.has(k), isToday: i === 6, run: runs.get(k) ?? 0 };
  });
  return { current, best: Math.max(best, current), today: noted, week, runs, first: sorted[0] ?? null };
}

// ---------- Badges ----------
export type BadgeFamily = 'regular' | 'saving' | 'control';
export const FAMILY_LABEL: Record<BadgeFamily, string> = {
  regular: 'Régularité',
  saving: 'Épargne',
  control: 'Maîtrise',
};

export interface Badge {
  id: string;
  family: BadgeFamily;
  name: string;
  icon: string; // icône lucide
  color: string;
  how: string; // comment l'obtenir
  done: string; // phrase de félicitations
  value: number; // progression actuelle
  target: number;
  unit: string; // au singulier (« jour », « opération »…), pluriel par unitOf
  unlocked: boolean;
  at?: string; // date d'obtention (AAAA-MM-JJ)
  isNew?: boolean; // obtenu mais pas encore vu
}

export const unitOf = (n: number, unit: string) => (n > 1 && !/s$/.test(unit) ? `${unit}s` : unit);

type Raw = Omit<Badge, 'unlocked' | 'at' | 'isNew'>;

const UNLOCK_KEY = 'ap.badges'; // { id: 'AAAA-MM-JJ' }
const SEEN_KEY = 'ap.badgesSeen'; // ids déjà montrés

const readJson = <T,>(k: string, fallback: T): T => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* stockage indisponible */
  }
};

export function computeBadges(args: {
  transactions: Transaction[];
  wallets: Wallet[];
  budgets: Budget[];
  categories: Category[];
  settings: Settings;
  debts: DebtEntry[];
  streak: Streak;
  now?: Date;
}): Badge[] {
  const { transactions, wallets, budgets, categories, settings, debts, streak, now = new Date() } = args;
  const today = startOfDay(now);
  const past = transactions.filter((t) => new Date(t.createdAt).getTime() < shift(today, 1).getTime());
  const count = past.length;

  // Mois terminés où il est entré plus d'argent qu'il n'en est sorti
  const months = new Map<string, { inc: number; out: number }>();
  for (const t of past) {
    if (!countsInStats(t)) continue;
    const d = new Date(t.createdAt);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) continue; // mois en cours
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const m = months.get(k) ?? { inc: 0, out: 0 };
    const v = toMain(t.amount, t.currency, settings);
    if (v > 0) m.inc += v;
    else m.out -= v;
    months.set(k, m);
  }
  const goodMonths = [...months.values()].filter((m) => m.inc > 0 && m.inc > m.out).length;

  // Objectifs
  const goals = wallets.filter((w) => w.kind === 'goal');
  const bestGoal = Math.max(0, ...goals.map((w) => goalInsight(w, transactions, now)?.ratio ?? 0));

  // Budget tenu : un budget au mois, sur un mois terminé, pas dépassé
  const kept = budgets.some((b) => {
    if (periodOf(b) !== 'month') return false;
    const s = budgetStatus(b, transactions, categories, settings, -1, now);
    return existedIn(b, s) && s.txs.length > 0 && s.ratio <= 1;
  });

  // Jours et week-ends sans dépense (depuis la première opération, sans compter aujourd'hui)
  const spendDays = new Set(past.filter((t) => t.amount < 0 && countsInStats(t)).map((t) => dayKey(new Date(t.createdAt))));
  const first = past.length ? startOfDay(new Date(Math.min(...past.map((t) => new Date(t.createdAt).getTime())))) : today;
  let freeDays = 0;
  let freeWeekends = 0;
  for (let d = first; d.getTime() < today.getTime(); d = shift(d, 1)) {
    if (spendDays.has(dayKey(d))) continue;
    freeDays++;
    // Dimanche sans dépense, et le samedi d'avant aussi (après le début)
    if (d.getDay() === 0) {
      const sat = shift(d, -1);
      if (sat.getTime() >= first.getTime() && !spendDays.has(dayKey(sat))) freeWeekends++;
    }
  }

  // Dette que tu devais, réglée
  const paidDebts = debts.filter((e) => e.side === 'payable' && ((e.total > 0 && e.left <= 0) || (e.pastTxs?.length ?? 0) > 0)).length;

  // Meilleure note de santé gardée (ap.healthHistory)
  const bestHealth = Math.max(0, ...Object.values(readJson<Record<string, number>>('ap.healthHistory', {})).filter((v) => typeof v === 'number'));

  const list: Raw[] = [
    { id: 'first', family: 'regular', name: 'Premier pas', icon: 'Footprints', color: '#0EA5E9', how: 'Note ta toute première opération.', done: 'Tu as noté ta première opération. Le plus dur est fait !', value: Math.min(count, 1), target: 1, unit: 'opération' },
    { id: 'streak3', family: 'regular', name: '3 jours de suite', icon: 'Flame', color: '#F97316', how: 'Note au moins une opération 3 jours de suite.', done: 'Trois jours sans oublier : une bonne habitude commence.', value: streak.current, target: 3, unit: 'jour' },
    { id: 'streak7', family: 'regular', name: 'Une semaine', icon: 'Flame', color: '#EF4444', how: 'Note au moins une opération chaque jour pendant 7 jours.', done: 'Une semaine complète ! Tu sais où va ton argent.', value: streak.current, target: 7, unit: 'jour' },
    { id: 'streak30', family: 'regular', name: 'Un mois entier', icon: 'Crown', color: '#A855F7', how: 'Note au moins une opération chaque jour pendant 30 jours.', done: 'Trente jours de suite : tu fais partie des meilleurs.', value: streak.current, target: 30, unit: 'jour' },
    { id: 'ops100', family: 'regular', name: '100 opérations', icon: 'ListChecks', color: '#14B8A6', how: 'Note 100 opérations en tout.', done: 'Cent opérations notées : ton historique devient précieux.', value: count, target: 100, unit: 'opération' },
    { id: 'goal', family: 'saving', name: 'Un rêve', icon: 'Target', color: '#6366F1', how: 'Crée ton premier objectif (une moto, un terrain, les frais scolaires…).', done: 'Tu as un objectif. Chaque petite somme te rapproche.', value: Math.min(goals.length, 1), target: 1, unit: 'objectif' },
    { id: 'goalHalf', family: 'saving', name: 'À mi-chemin', icon: 'Mountain', color: '#8B5CF6', how: 'Mets de côté la moitié d’un de tes objectifs.', done: 'La moitié est faite : le plus beau reste à venir.', value: Math.min(50, Math.floor(bestGoal * 100)), target: 50, unit: '%' },
    { id: 'goalDone', family: 'saving', name: 'Objectif atteint', icon: 'Trophy', color: '#F59E0B', how: 'Atteins le montant d’un de tes objectifs.', done: 'Objectif atteint ! Bravo, tu l\u2019as fait.', value: Math.min(100, Math.floor(bestGoal * 100)), target: 100, unit: '%' },
    { id: 'month', family: 'saving', name: 'Mois positif', icon: 'TrendingUp', color: '#10B981', how: 'Finis un mois en ayant reçu plus d’argent que tu n’en as dépensé.', done: 'Un mois dans le vert : tu as gardé de l’argent.', value: Math.min(goodMonths, 1), target: 1, unit: 'mois' },
    { id: 'month3', family: 'saving', name: '3 mois positifs', icon: 'Gem', color: '#06B6D4', how: 'Finis 3 mois dans le vert (plus de revenus que de dépenses).', done: 'Trois mois dans le vert : ton épargne grandit.', value: goodMonths, target: 3, unit: 'mois' },
    { id: 'budget', family: 'control', name: 'Premier budget', icon: 'PieChart', color: '#3B82F6', how: 'Crée un budget pour une catégorie (nourriture, transport…).', done: 'Tu as fixé une limite. C’est comme ça qu’on garde le contrôle.', value: Math.min(budgets.length, 1), target: 1, unit: 'budget' },
    { id: 'budgetKept', family: 'control', name: 'Budget tenu', icon: 'ShieldCheck', color: '#22C55E', how: 'Finis un mois sans dépasser un de tes budgets du mois.', done: 'Budget respecté tout un mois. Bravo pour la discipline !', value: kept ? 1 : 0, target: 1, unit: 'mois' },
    { id: 'freeDay', family: 'control', name: 'Journée sans dépense', icon: 'Sun', color: '#EAB308', how: 'Passe une journée entière sans aucune dépense.', done: 'Une journée sans rien dépenser : ton portefeuille te dit merci.', value: Math.min(freeDays, 1), target: 1, unit: 'jour' },
    { id: 'freeWeekend', family: 'control', name: 'Week-end tranquille', icon: 'Sofa', color: '#EC4899', how: 'Passe un samedi et un dimanche sans aucune dépense.', done: 'Un week-end entier sans dépense, c’est rare !', value: Math.min(freeWeekends, 1), target: 1, unit: 'week-end' },
    { id: 'debtPaid', family: 'control', name: 'Dette réglée', icon: 'HandCoins', color: '#F43F5E', how: 'Rembourse entièrement une dette notée dans Dettes et prêts.', done: 'Dette remboursée : un poids en moins.', value: Math.min(paidDebts, 1), target: 1, unit: 'dette' },
    { id: 'health70', family: 'control', name: 'En pleine forme', icon: 'HeartPulse', color: '#E11D48', how: 'Atteins une santé financière de 70 sur 100.', done: 'Ta santé financière est au vert. Continue comme ça !', value: Math.min(70, bestHealth), target: 70, unit: 'point' },
  ];

  // Date d'obtention gardée : un badge obtenu ne se perd plus
  const unlockedAt = readJson<Record<string, string>>(UNLOCK_KEY, {});
  const seen = new Set(readJson<string[]>(SEEN_KEY, []));
  let changed = false;
  const todayKey = dayKey(today);
  const out = list.map((b) => {
    // Séries : le record compte aussi (une série de 7 jours déjà faite débloque « Une semaine »)
    const reached = b.value >= b.target || (b.id.startsWith('streak') && streak.best >= b.target);
    if (reached && !unlockedAt[b.id]) {
      unlockedAt[b.id] = todayKey;
      changed = true;
    }
    const at = unlockedAt[b.id];
    return { ...b, unlocked: !!at, at, isNew: !!at && !seen.has(b.id) };
  });
  if (changed) writeJson(UNLOCK_KEY, unlockedAt);
  return out;
}

export function markBadgesSeen(badges: Badge[]) {
  const ids = badges.filter((b) => b.unlocked).map((b) => b.id);
  const seen = new Set(readJson<string[]>(SEEN_KEY, []));
  if (ids.every((id) => seen.has(id))) return;
  writeJson(SEEN_KEY, [...new Set([...seen, ...ids])]);
}
