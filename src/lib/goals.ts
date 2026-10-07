import { GoalChallenge, Transaction, Wallet } from '../types';

// Portefeuille objectif : avance / retard sur la date visée, estimation au rythme réel,
// et montant à épargner par jour / semaine / mois.

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Nombre de jours entiers entre deux dates (arrondi : insensible aux changements d'heure)
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);

// Arrondi vers le haut à un pas lisible : 2 chiffres significatifs dès 1 000 (8 320 FC -> 8 400 FC),
// à l'unité au-dessus de 20 (40,2 $ -> 41 $), au demi en dessous (5,47 $ -> 5,50 $)
export function niceAmount(v: number): number {
  const step = v >= 1000 ? 10 ** (Math.floor(Math.log10(v)) - 1) : v >= 20 ? 1 : 0.5;
  return Math.ceil(v / step - 1e-9) * step;
}

export type GoalStatus =
  | { kind: 'reached' }
  | { kind: 'ahead'; days: number }
  | { kind: 'behind'; missing: number }
  | { kind: 'onTrack' }
  | { kind: 'passed'; date: Date }
  | { kind: 'eta'; date: Date } // sans date visée : quand l'objectif sera atteint au rythme actuel
  | { kind: 'etaTooFar' }
  | { kind: 'stalled' } // sans date visée : l'épargne n'avance pas
  | { kind: 'tooEarly' } // sans date visée : pas encore assez d'historique
  | null;

export interface GoalInsight {
  saved: number;
  left: number;
  ratio: number;
  start: Date | null; // début de l'objectif : jour de la première opération (null = aucune encore)
  status: GoalStatus;
  // Rythme conseillé pour finir à la date visée (absent sans date, ou date passée)
  pace?: { perDay: number; perWeek?: number; perMonth?: number; daysLeft: number };
}

// Fenêtre (jours) sur laquelle on mesure le rythme réel quand il n'y a pas de date visée
const ETA_WINDOW = 90;
const ETA_MIN_HISTORY = 14;

export function goalInsight(w: Wallet, transactions: Transaction[], now = new Date()): GoalInsight | null {
  const goal = w.goalAmount;
  if (!goal || goal <= 0) return null;
  const txs = transactions.filter((t) => t.walletId === w.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const balance = txs.reduce((s, t) => s + t.amount, w.initialBalance);
  const saved = Math.max(0, balance);
  const left = Math.max(0, goal - saved);
  const ratio = saved / goal;
  const today = startOfDay(now);
  // Pas de date de création : le départ est la première opération du portefeuille
  const first = txs.length ? startOfDay(new Date(txs[0].createdAt)) : null;

  if (left <= 0) return { saved, left, ratio, start: first, status: { kind: 'reached' } };

  if (w.goalDate) {
    const end = new Date(w.goalDate + 'T00:00');
    const daysLeft = daysBetween(today, end);
    if (daysLeft < 0) return { saved, left, ratio, start: first, status: { kind: 'passed', date: end } };

    // Rythme conseillé : on compte le jour visé lui-même (au moins 1 jour)
    const n = Math.max(1, daysLeft);
    const perDay = left / n;
    const pace = {
      perDay: niceAmount(perDay),
      perWeek: n >= 14 ? niceAmount(perDay * 7) : undefined,
      perMonth: n >= 60 ? niceAmount(perDay * 30.44) : undefined,
      daysLeft,
    };

    // Avance / retard : l'épargne devrait monter en ligne droite du départ à la date visée
    let status: GoalStatus = null;
    if (first && first < end) {
      const startAmount = Math.max(0, w.initialBalance);
      const total = daysBetween(first, end);
      const elapsed = Math.min(total, daysBetween(first, today));
      const rate = (goal - startAmount) / total; // par jour
      if (rate > 0 && elapsed >= 0) {
        const expected = startAmount + rate * elapsed;
        const diff = saved - expected;
        const diffDays = diff / rate;
        if (Math.abs(diffDays) < 2) status = { kind: 'onTrack' };
        else if (diff > 0) status = { kind: 'ahead', days: Math.round(diffDays) };
        else status = { kind: 'behind', missing: niceAmount(-diff) };
      }
    }
    return { saved, left, ratio, start: first, status, pace };
  }

  // Sans date visée : estimation au rythme réel des derniers mois
  if (!first) return { saved, left, ratio, start: first, status: null };
  const windowStart = new Date(Math.max(first.getTime(), today.getTime() - ETA_WINDOW * DAY));
  const span = daysBetween(windowStart, today);
  if (span < ETA_MIN_HISTORY) return { saved, left, ratio, start: first, status: { kind: 'tooEarly' } };
  const net = txs.filter((t) => new Date(t.createdAt) >= windowStart).reduce((s, t) => s + t.amount, 0);
  if (net <= 0) return { saved, left, ratio, start: first, status: { kind: 'stalled' } };
  const daysToGo = Math.ceil(left / (net / span));
  if (daysToGo > 3650) return { saved, left, ratio, start: first, status: { kind: 'etaTooFar' } };
  return { saved, left, ratio, start: first, status: { kind: 'eta', date: new Date(today.getTime() + daysToGo * DAY) } };
}

// ---------- Série : semaines d'affilée avec au moins un dépôt ----------
// weekStart : 0 dimanche, 1 lundi, 6 samedi (Paramètres › Affichage)
const startOfWeek = (d: Date, weekStart: number) => {
  const s = startOfDay(d);
  s.setDate(s.getDate() - ((s.getDay() - weekStart + 7) % 7));
  return s;
};

export interface GoalStreak {
  current: number; // semaines d'affilée (la semaine en cours compte si un dépôt y est déjà fait)
  record: number; // plus longue série
  thisWeekDone: boolean; // dépôt déjà fait cette semaine
  lastDay: Date; // dernier jour de la semaine en cours (pour « avant dimanche »)
}

export function goalStreak(w: Wallet, transactions: Transaction[], weekStart: number, now = new Date()): GoalStreak {
  // Une semaine = un nombre : jours depuis 1970 du début de semaine, divisé par 7
  const weekNo = (d: Date) => Math.round(startOfWeek(d, weekStart).getTime() / (7 * DAY));
  const weeks = new Set(transactions.filter((t) => t.walletId === w.id && t.amount > 0).map((t) => weekNo(new Date(t.createdAt))));
  const cur = weekNo(now);
  const thisWeekDone = weeks.has(cur);
  // Semaine en cours sans dépôt : la série n'est pas encore cassée, on compte depuis la précédente
  let current = 0;
  for (let k = thisWeekDone ? cur : cur - 1; weeks.has(k); k--) current++;
  let record = 0;
  for (const k of weeks) {
    if (weeks.has(k - 1)) continue; // pas le début d'une série
    let n = 0;
    while (weeks.has(k + n)) n++;
    record = Math.max(record, n);
  }
  const lastDay = startOfWeek(now, weekStart);
  lastDay.setDate(lastDay.getDate() + 6);
  return { current, record, thisWeekDone, lastDay };
}

// ---------- Avancée du mois : de combien chaque objectif a progressé depuis le début du mois ----------
export interface MonthGoalProgress {
  wallet: Wallet;
  added: number; // épargne gagnée ce mois-ci (devise de l'objectif)
  points: number; // en points de pourcentage de l'objectif (ex. 18 = +18 %)
}

export function monthGoalProgress(wallets: Wallet[], transactions: Transaction[], monthStart: Date): MonthGoalProgress[] {
  const out: MonthGoalProgress[] = [];
  for (const w of wallets) {
    if (w.kind !== 'goal' || w.archived || !w.goalAmount) continue;
    let before = w.initialBalance;
    let now = w.initialBalance;
    for (const t of transactions) {
      if (t.walletId !== w.id) continue;
      now += t.amount;
      if (new Date(t.createdAt) < monthStart) before += t.amount;
    }
    const added = Math.max(0, now) - Math.max(0, before);
    if (added > 0) out.push({ wallet: w, added, points: (added / w.goalAmount) * 100 });
  }
  return out.sort((a, b) => b.points - a.points);
}

// ---------- Équivalence parlante : « l'équivalent de 3 mois de loyer » ----------
// Comparé à tes propres dépenses : moyenne par mois de chaque catégorie sur les 3 derniers mois,
// dans la devise de l'objectif (pas de conversion). On prend la plus grosse catégorie qui donne au moins 1 semaine.
// spending : opérations hors portefeuilles objectifs (un retrait d'un objectif n'est pas une dépense de référence)
export function goalEquivalence(w: Wallet, saved: number, spending: Transaction[], now = new Date()): string | null {
  if (saved <= 0) return null;
  const transactions = spending;
  const since = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  const byCat = new Map<string, number>();
  for (const t of transactions) {
    if (t.amount >= 0 || t.type === 'transfer' || t.type === 'adjustment' || t.excludeFromReport) continue;
    if (t.currency !== w.currency || new Date(t.createdAt) < since) continue;
    const name = t.category?.trim();
    if (!name) continue;
    byCat.set(name, (byCat.get(name) ?? 0) - t.amount);
  }
  // Moyenne sur la durée vraiment couverte : quelqu'un qui a commencé il y a 1 mois n'a pas 3 mois de dépenses
  // (sinon un seul loyer noté donnerait « 24 mois de loyer » au lieu de 8). Entre 1 et 3 mois.
  const first = transactions.reduce((m, t) => Math.min(m, new Date(t.createdAt).getTime()), Infinity);
  // Mois entamés : 3 loyers payés sur 70 jours = 3 mois de loyer
  const months = Math.min(3, Math.max(1, Math.ceil((now.getTime() - first) / (30.44 * DAY))));
  const cats = [...byCat].map(([name, total]) => ({ name, perMonth: total / months })).sort((a, b) => b.perMonth - a.perMonth);
  for (const c of cats) {
    const months = saved / c.perMonth;
    const weeks = months * (52 / 12);
    if (weeks < 1) continue;
    // « de loyer », « d'alimentation »
    const lower = c.name.charAt(0).toLowerCase() + c.name.slice(1);
    const de = /^[aeiouyhâàéèêîïôûù]/i.test(lower) ? `d'${lower}` : `de ${lower}`;
    if (months >= 1.5) {
      const n = months >= 10 ? Math.round(months) : Math.round(months * 2) / 2;
      return `l'équivalent de ${String(n).replace('.', ',')} mois ${de}`;
    }
    const n = Math.round(weeks);
    return `l'équivalent de ${n} semaine${n > 1 ? 's' : ''} ${de}`;
  }
  return null;
}

// ---------- Courbe d'évolution : épargne jour après jour ----------
export interface GoalSeries {
  start: Date;
  points: { t: number; v: number }[]; // t = date (ms), v = épargné ce jour-là (fin de journée)
  startAmount: number;
}

export function goalSeries(w: Wallet, transactions: Transaction[], now = new Date()): GoalSeries | null {
  const txs = transactions.filter((t) => t.walletId === w.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!txs.length) return null;
  const start = startOfDay(new Date(txs[0].createdAt));
  const startAmount = Math.max(0, w.initialBalance);
  const points: { t: number; v: number }[] = [{ t: start.getTime(), v: startAmount }];
  let bal = w.initialBalance;
  for (const t of txs) {
    bal += t.amount;
    const day = startOfDay(new Date(t.createdAt)).getTime();
    const last = points[points.length - 1];
    if (last.t === day) last.v = Math.max(0, bal);
    else points.push({ t: day, v: Math.max(0, bal) });
  }
  const today = startOfDay(now).getTime();
  if (points[points.length - 1].t < today) points.push({ t: today, v: points[points.length - 1].v });
  return { start, points, startAmount };
}

// Temps restant lisible : « 12 jours », « 8 mois », « 4 ans et 1 mois »
export function timeLeftLabel(days: number): string {
  if (days <= 60) return `${days} jour${days > 1 ? 's' : ''}`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} mois`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} ans${m ? ` et ${m} mois` : ''}`;
}

// ---------- Défis d'épargne ----------
const dayIndex = (start: string, now: Date) => daysBetween(new Date(`${start}T00:00`), now); // 0 = jour du début
export const challengeWeek = (ch: GoalChallenge, now = new Date()) => Math.min(52, Math.max(1, Math.floor(dayIndex(ch.start, now) / 7) + 1));
export const challengeDay = (ch: GoalChallenge, now = new Date()) => dayIndex(ch.start, now) + 1;
// Montant total d'un défi : 52 semaines = base × (1 + 2 + … + 52) = base × 1 378 ; chaque jour = base × jours
export const challengeTotal = (type: GoalChallenge['type'], base: number, days = 30) =>
  type === '52w' ? base * 1378 : type === 'daily' ? base * days : 0;

// ---------- Rappel de la semaine : c'est le jour, et pas encore assez mis cette semaine ----------
// Renvoie ce qu'il reste à mettre (0 = pas de rappel aujourd'hui). Défi « chaque jour » : tous les jours, le
// montant de base ; défi 52 semaines : base × n° de la semaine, le jour choisi.
export function reminderDue(w: Wallet, transactions: Transaction[], weekStart: number, now = new Date()): number {
  if (w.archived) return 0;
  const ch = w.challenge;
  const r = w.goalReminder;
  const saved = transactions.filter((t) => t.walletId === w.id).reduce((s, t) => s + t.amount, w.initialBalance);
  if (w.goalAmount && saved >= w.goalAmount) return 0;
  let want: number;
  let since: number;
  if (ch?.type === 'daily' && ch.base) {
    const d = challengeDay(ch, now);
    if (d < 1 || d > (ch.days ?? 30)) return 0;
    want = ch.base;
    since = startOfDay(now).getTime();
  } else {
    if (!r || now.getDay() !== r.day) return 0;
    want = ch?.type === '52w' && ch.base ? ch.base * challengeWeek(ch, now) : r.amount;
    since = startOfWeek(now, weekStart).getTime();
  }
  const put = transactions
    .filter((t) => t.walletId === w.id && t.amount > 0 && new Date(t.createdAt).getTime() >= since)
    .reduce((sum, t) => sum + t.amount, 0);
  const left = Math.max(0, want - put);
  // Sans dépasser ce qu'il reste pour atteindre l'objectif
  return Math.round(Math.min(left, w.goalAmount ? w.goalAmount - saved : left) * 100) / 100;
}

// ---------- Défi « week-end sans dépense » : ce qu'on n'a pas dépensé par rapport à d'habitude ----------
// Dernier week-end terminé (samedi + dimanche) comparé à la moyenne des 8 précédents.
export function weekendSaving(
  goal: Wallet,
  wallets: Wallet[],
  transactions: Transaction[],
  convert: (v: number, from: string, to: string) => number | null,
  now = new Date()
): { usual: number; last: number; saved: number; key: string } | null {
  const ordinary = new Set(wallets.filter((w) => (w.kind ?? 'basic') !== 'goal' && !w.archived).map((w) => w.id));
  // Samedi du dernier week-end terminé
  const d = startOfDay(now);
  const back = d.getDay() === 0 ? 8 : d.getDay() === 6 ? 7 : d.getDay() + 1;
  const sat = new Date(d.getTime() - back * DAY);
  const spent = (satTime: number) => {
    let s = 0;
    for (const t of transactions) {
      if (!ordinary.has(t.walletId) || t.amount >= 0 || t.type === 'transfer' || t.type === 'adjustment') continue;
      const at = new Date(t.createdAt).getTime();
      if (at < satTime || at >= satTime + 2 * DAY) continue;
      const v = t.currency === goal.currency ? -t.amount : convert(-t.amount, t.currency, goal.currency);
      if (v !== null) s += v;
    }
    return s;
  };
  const last = spent(sat.getTime());
  const before = Array.from({ length: 8 }, (_, i) => spent(sat.getTime() - (i + 1) * 7 * DAY));
  const known = before.filter((v) => v > 0);
  if (known.length < 2) return null; // pas assez d'historique pour savoir ce qui est « d'habitude »
  const usual = known.reduce((a, b) => a + b, 0) / known.length;
  const saved = Math.round(Math.max(0, usual - last) * 100) / 100;
  return { usual: Math.round(usual * 100) / 100, last: Math.round(last * 100) / 100, saved, key: `we-${sat.toISOString().slice(0, 10)}` };
}

// ---------- Arrondis : la « petite monnaie » des dépenses de la semaine ----------
// 4 300 FC -> 700 FC (au millier) ; 4,30 $ -> 0,70 $ (au dollar). Monnaies à gros chiffres : au millier.
const BIG_UNIT = new Set(['CDF', 'XAF', 'XOF', 'UGX', 'RWF', 'TZS', 'BIF', 'KES', 'NGN', 'GNF', 'MGA']);
export const roundUpOf = (amount: number, currency: string) => {
  const step = BIG_UNIT.has(currency.toUpperCase()) ? 1000 : 1;
  const a = Math.abs(amount);
  const up = Math.ceil(a / step - 1e-9) * step - a;
  return up > 1e-9 ? up : 0;
};

// Total de la semaine, dans la devise de l'objectif. Seulement les vraies dépenses des portefeuilles
// ordinaires (pas les transferts, pas les objectifs) ; convert = conversion de devise (null si pas de taux).
export function weekRoundUps(
  goal: Wallet,
  wallets: Wallet[],
  transactions: Transaction[],
  weekStart: number,
  convert: (v: number, from: string, to: string) => number | null,
  now = new Date()
): { total: number; count: number } {
  const ordinary = new Set(wallets.filter((w) => (w.kind ?? 'basic') !== 'goal' && !w.archived).map((w) => w.id));
  const since = startOfWeek(now, weekStart).getTime();
  let total = 0;
  let count = 0;
  for (const t of transactions) {
    if (!ordinary.has(t.walletId) || t.amount >= 0 || t.type === 'transfer' || t.type === 'adjustment') continue;
    if (new Date(t.createdAt).getTime() < since) continue;
    const up = roundUpOf(t.amount, t.currency);
    if (!up) continue;
    const v = t.currency === goal.currency ? up : convert(up, t.currency, goal.currency);
    if (v === null) continue;
    total += v;
    count++;
  }
  return { total: Math.round(total * 100) / 100, count };
}

// Numéro de semaine (pour se souvenir que les arrondis de cette semaine sont déjà versés)
export const weekKey = (weekStart: number, now = new Date()) => startOfWeek(now, weekStart).toISOString().slice(0, 10);
