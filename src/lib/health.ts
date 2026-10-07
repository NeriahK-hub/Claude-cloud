import { Budget, Settings, Transaction, Wallet } from '../types';
import { BudgetDraft, niceBudget } from './budgetDraft';
import type { GoalDraft } from './goalMilestones';
import { smartTips } from './healthInsights';
import type { Jump } from './jumpTo';
import { Category } from '../data/categories';
import { countsInStats, formatMoney, toMain, walletBalance } from './money';
import { getPrefs } from './display';
import { budgetStatus, existedIn, budgetRange, periodOf } from './budgets';
import { DebtEntry, dueLevel, isDebtTransaction } from './debts';

// Score de santé financière (sur 100) : des règles simples, calculées sur le téléphone, sans internet.
// Cinq parties, chacune avec ses points, ses chiffres, ses règles et un conseil quand elle est faible.

export type HealthPartId = 'savings' | 'budgets' | 'debts' | 'cushion' | 'regular';
// budget : fiche « Nouveau budget » ouverte déjà remplie (catégorie + montant proposé)
export type HealthAction = { label: string; page: 'budgets' | 'debts' | 'goals' | 'history' | 'statistic' | 'wallets'; budget?: BudgetDraft; goal?: GoalDraft; jump?: Jump }; // jump : ouvrir l'endroit exact (portefeuille, budget, dette, opération…)
type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface HealthPart {
  id: HealthPartId;
  label: string;
  points: number;
  max: number;
  text: string; // où tu en es, en une phrase
  tip?: string; // quoi faire pour gagner des points
  why: string; // pourquoi c'est important
  stats: { label: string; value: string; tone?: Tone }[]; // tes chiffres
  rules: { when: string; points: number; active: boolean }[]; // comment gagner des points
  items?: { name: string; value: string; sub?: string; ratio?: number; tone?: Tone; icon?: string; color?: string }[]; // budgets, dettes
  days?: { day: string; on: boolean }[]; // régularité : les 14 derniers jours
  meter?: { value: number; max: number; marks: { at: number; label: string }[] }; // réserve : mois couverts
  flows?: { income: number; expense: number; incomeText: string; expenseText: string }; // épargne
  action?: HealthAction;
}

export interface HealthTip {
  text: string;
  title: string; // en quelques mots
  part: HealthPartId | 'trend' | 'forecast' | 'check' | 'goal'; // forecast / check / goal : voir healthInsights.ts
  why: string;
  stats?: { label: string; value: string; tone?: Tone }[];
  action?: HealthAction;
  weight: number;
}

export interface Health {
  score: number;
  level: 'great' | 'good' | 'fair' | 'weak';
  label: string;
  parts: HealthPart[];
  tips: HealthTip[]; // du plus utile au moins utile
}

const DAY = 86400000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function computeHealth(args: {
  transactions: Transaction[];
  wallets: Wallet[];
  budgets: Budget[];
  categories: Category[];
  settings: Settings;
  debts: DebtEntry[];
  money: (v: number) => string; // en devise principale, arrondi
  now?: Date;
}): Health | null {
  const { transactions, wallets, budgets, categories, settings, debts, money } = args;
  const now = args.now ?? new Date();
  const t30 = now.getTime() - 30 * DAY;
  const main = (t: Transaction) => toMain(t.amount, t.currency, settings);
  const at = (t: Transaction) => new Date(t.createdAt).getTime();

  // Vraies entrées / sorties (sans transferts, ajustements, ni prêts / dettes)
  const real = transactions.filter((t) => countsInStats(t) && !isDebtTransaction(t) && at(t) <= now.getTime());
  if (real.length < 5) return null; // pas encore assez d'opérations pour une note juste

  const last30 = real.filter((t) => at(t) > t30);
  const income = last30.filter((t) => t.amount > 0).reduce((s, t) => s + main(t), 0);
  const expense = last30.filter((t) => t.amount < 0).reduce((s, t) => s - main(t), 0);
  const tips: HealthTip[] = [];
  const parts: HealthPart[] = [];
  const addTip = (p: HealthPart, title: string) => {
    if (p.tip) tips.push({ text: p.tip, title, part: p.id, why: p.why, stats: p.stats.slice(0, 3), action: p.action, weight: p.max - p.points });
  };

  // 1. Épargne (30) : part des revenus qui reste
  {
    const max = 30;
    const goalIds = new Set(wallets.filter((w) => w.kind === 'goal' && !w.archived).map((w) => w.id));
    const toGoals = transactions.filter((t) => goalIds.has(t.walletId) && t.amount > 0 && at(t) > t30 && at(t) <= now.getTime()).reduce((s, t) => s + main(t), 0);
    const rate = income > 0 ? (income - expense) / income : null;
    let points: number;
    let text: string;
    let tip: string | undefined;
    if (rate === null) {
      points = toGoals > 0 ? 12 : 0;
      text = toGoals > 0 ? `Pas de revenu noté, mais ${money(toGoals)} mis dans tes objectifs.` : 'Aucun revenu noté ces 30 derniers jours.';
      tip = 'Note aussi tes revenus (salaire, ventes…) : Wallo pourra calculer ce que tu épargnes.';
    } else {
      points = rate >= 0.2 ? 30 : rate >= 0.1 ? 22 : rate > 0 ? 12 : 0;
      text = rate > 0 ? `Tu gardes ${Math.round(rate * 100)} % de ce que tu gagnes.` : `Tu as dépensé plus que tu n'as gagné (${money(expense - income)} de plus).`;
      if (rate < 0.1)
        tip =
          rate > 0
            ? `Essaie de garder 10 % de tes revenus : encore ${money(Math.max(0, income * 0.1 - (income - expense)))} à mettre de côté ce mois-ci.`
            : overspendTip(expense - income, last30, categories, main, money);
    }
    const kept = income - expense;
    const p: HealthPart = {
      id: 'savings',
      label: 'Épargne',
      points,
      max,
      text,
      tip,
      why: "Garder une partie de ce que tu gagnes, c'est ce qui te permet d'atteindre tes objectifs et de faire face aux imprévus sans t'endetter.",
      stats: [
        { label: 'Revenus (30 jours)', value: money(income), tone: 'good' },
        { label: 'Dépenses (30 jours)', value: money(expense), tone: 'bad' },
        { label: kept >= 0 ? 'Ce que tu as gardé' : 'Ce qui manque', value: money(Math.abs(kept)), tone: kept >= 0 ? 'good' : 'bad' },
        ...(toGoals > 0 ? [{ label: 'Mis dans tes objectifs', value: money(toGoals), tone: 'good' as Tone }] : []),
      ],
      rules: [
        { when: 'Tu gardes 20 % ou plus', points: 30, active: points === 30 },
        { when: 'Tu gardes de 10 à 20 %', points: 22, active: points === 22 },
        { when: 'Tu gardes un peu (moins de 10 %)', points: 12, active: points === 12 },
        { when: 'Tu dépenses plus que tu gagnes', points: 0, active: points === 0 },
      ],
      flows: { income, expense, incomeText: money(income), expenseText: money(expense) },
      action: { label: 'Voir mes objectifs', page: 'goals' },
    };
    parts.push(p);
    addTip(p, rate === null ? 'Note tes revenus' : rate > 0 ? 'Garde un peu plus' : 'Dépense moins que tu gagnes');
  }

  // 2. Budgets (25) : budgets de la période en cours qui tiennent
  {
    const max = 25;
    const today = ymd(now);
    const live = budgets.filter((b) => existedIn(b, budgetRange(b, 0, now)) && (periodOf(b) !== 'custom' || (b.to ?? '') >= today));
    const st = live.map((b) => budgetStatus(b, transactions, categories, settings, 0, now));
    const ok = st.filter((s) => s.ratio < 1).length;
    const points = live.length ? Math.round((ok / live.length) * max) : 10;
    const nameOf = (b: Budget) => (b.categoryId ? categories.find((c) => c.id === b.categoryId)?.name ?? 'Budget' : 'Toutes les dépenses');
    let tip: string | undefined;
    // Pas de budget : on prépare celui de la plus grosse dépense des 30 derniers jours
    let firstBudget: BudgetDraft | undefined;
    if (!live.length) {
      const byMain = new Map<string, number>();
      for (const t of last30) {
        if (t.amount >= 0) continue;
        // Catégorie par son id, sinon par son nom (opérations importées)
        const c = categories.find((x) => x.id === t.categoryId) ?? categories.find((x) => x.name === t.category && x.type === 'expense');
        const k = c?.parentId ?? c?.id;
        if (k) byMain.set(k, (byMain.get(k) ?? 0) - main(t));
      }
      const top = [...byMain].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0) firstBudget = { categoryId: top[0], amount: niceBudget(top[1]) };
    }
    if (!live.length) tip = 'Crée un budget pour ta plus grosse dépense : Wallo te préviendra avant de dépasser.';
    else if (ok < live.length) {
      const worst = live[st.findIndex((s) => s.ratio === Math.max(...st.map((x) => x.ratio)))];
      tip = `Le budget « ${nameOf(worst)} » est dépassé : regarde ses dernières dépenses ou ajuste son montant.`;
    }
    const p: HealthPart = {
      id: 'budgets',
      label: 'Budgets',
      points,
      max,
      text: live.length ? `${ok} budget${ok > 1 ? 's' : ''} tenu${ok > 1 ? 's' : ''} sur ${live.length}.` : 'Pas encore de budget.',
      tip,
      why: "Un budget fixe une limite avant de dépenser. C'est le moyen le plus simple de ne pas être surpris à la fin du mois.",
      stats: live.length
        ? [
            { label: 'Budgets tenus', value: `${ok} sur ${live.length}`, tone: ok === live.length ? 'good' : 'warn' },
            { label: 'Budgets dépassés', value: String(live.length - ok), tone: ok === live.length ? 'neutral' : 'bad' },
          ]
        : [{ label: 'Budgets', value: 'Aucun', tone: 'neutral' }],
      rules: [
        { when: 'Tous tes budgets tiennent', points: 25, active: !!live.length && ok === live.length },
        { when: 'Une partie de tes budgets tient', points: Math.round(max / 2), active: !!live.length && ok < live.length && ok > 0 },
        { when: "Tu n'as pas encore de budget", points: 10, active: !live.length },
        { when: 'Tous tes budgets sont dépassés', points: 0, active: !!live.length && ok === 0 },
      ],
      items: live.map((b, i) => {
        const c = categories.find((x) => x.id === b.categoryId);
        const s = st[i];
        return {
          name: nameOf(b),
          value: `${Math.round(s.ratio * 100)} %`,
          sub: s.left < 0 ? 'Dépassé' : `Reste ${money(toMain(s.left, b.currency, settings))}`,
          ratio: s.ratio,
          tone: s.ratio >= 1 ? 'bad' : s.ratio >= 0.8 ? 'warn' : 'good',
          icon: c?.icon ?? 'Layers',
          color: c?.color ?? '#64748B',
        };
      }),
      action: !live.length
        ? { label: 'Créer un budget', page: 'budgets', budget: firstBudget }
        : ok < live.length
          ? { label: 'Voir ce budget', page: 'budgets', jump: { kind: 'budget', id: live[st.findIndex((x) => x.ratio === Math.max(...st.map((y) => y.ratio)))].id } }
          : { label: 'Voir mes budgets', page: 'budgets' },
    };
    parts.push(p);
    addTip(p, live.length ? 'Un budget est dépassé' : 'Crée ton premier budget');
  }

  // 3. Dettes (20) : ce que je dois, en retard ou non, et si ça baisse
  {
    const max = 20;
    const mine = debts.filter((d) => d.side === 'payable' && d.left > 0.004);
    // Une dette peut être en $ ou en FC : le total est ramené à la devise principale
    const owed = mine.reduce((s, d) => s + (d.currency ? toMain(d.left, d.currency, settings) : d.left), 0);
    const late = mine.filter((d) => dueLevel(d, now) === 'late');
    const repaidSum = transactions.filter((t) => t.categoryId === 'debt-repay' && at(t) > t30 && at(t) <= now.getTime()).reduce((s, t) => s - main(t), 0);
    const repaid = repaidSum > 0;
    const points = !mine.length ? max : late.length ? 4 : repaid ? 15 : 9;
    const tip = !mine.length
      ? undefined
      : late.length
        ? `Ta dette envers ${late[0].name} est en retard : rembourse une petite partie ou fixe une nouvelle date avec cette personne.`
        : repaid
          ? undefined
          : 'Rembourse un peu de tes dettes chaque mois, même une petite somme : elles baisseront plus vite.';
    const p: HealthPart = {
      id: 'debts',
      label: 'Dettes',
      points,
      max,
      text: !mine.length ? 'Aucune dette en cours.' : late.length ? `${late.length} dette${late.length > 1 ? 's' : ''} en retard.` : `Tu dois encore ${money(owed)}.`,
      tip,
      why: "Une dette qui traîne coûte cher et pèse sur la confiance. La rembourser petit à petit libère de l'argent pour toi.",
      stats: [
        { label: 'Total que tu dois', value: money(owed), tone: owed > 0 ? 'warn' : 'good' },
        { label: 'Dettes en retard', value: String(late.length), tone: late.length ? 'bad' : 'neutral' },
        { label: 'Remboursé (30 jours)', value: money(Math.max(0, repaidSum)), tone: repaid ? 'good' : 'neutral' },
      ],
      rules: [
        { when: 'Aucune dette', points: 20, active: !mine.length },
        { when: 'Tu as remboursé ce mois-ci', points: 15, active: !!mine.length && !late.length && repaid },
        { when: 'Dettes sans remboursement ce mois-ci', points: 9, active: !!mine.length && !late.length && !repaid },
        { when: 'Une dette est en retard', points: 4, active: !!late.length },
      ],
      items: mine.map((d) => {
        const lvl = dueLevel(d, now);
        return {
          name: d.name,
          value: d.currency ? formatMoney(Math.round(d.left), d.currency, { ...getPrefs(), decimals: 'never' }) : money(d.left), // dans la devise de la dette
          sub: lvl === 'late' ? 'En retard' : d.due ? `À rendre avant le ${d.due.split('-').reverse().slice(0, 2).join('/')}` : 'Sans date',
          tone: lvl === 'late' ? 'bad' : 'neutral',
          ratio: d.total + d.interest > 0 ? d.paid / (d.total + d.interest) : 0,
        };
      }),
      action: late.length ? { label: `Voir ma dette envers ${late[0].name}`, page: 'debts', jump: { kind: 'debt', key: late[0].key } } : { label: 'Voir mes dettes', page: 'debts' },
    };
    parts.push(p);
    addTip(p, late.length ? 'Une dette est en retard' : 'Rembourse un peu chaque mois');
  }

  // 4. Réserve (15) : combien de temps ton argent tiendrait au rythme de tes dépenses
  {
    const max = 15;
    const total = wallets
      .filter((w) => !w.archived && w.includeInTotal && w.kind !== 'credit')
      .reduce((s, w) => s + toMain(walletBalance(w, transactions), w.currency, settings), 0);
    const months = expense > 0 ? Math.max(0, total) / expense : total > 0 ? 3 : 0;
    const points = months >= 3 ? 15 : months >= 1 ? 10 : months >= 0.5 ? 5 : 0;
    const daysCovered = Math.round(months * 30);
    const text =
      expense <= 0
        ? 'Pas de dépense notée ce mois-ci.'
        : months >= 1
          ? `Ton argent couvre environ ${(Math.round(months * 10) / 10).toLocaleString('fr-FR')} mois de dépenses.`
          : daysCovered >= 1
            ? `Ton argent couvre environ ${daysCovered} jour${daysCovered > 1 ? 's' : ''} de dépenses.`
            : 'Ton argent ne couvre presque aucun jour de dépenses.';
    const p: HealthPart = {
      id: 'cushion',
      label: 'Réserve',
      points,
      max,
      text,
      tip: points < 10 ? cushionTip(expense, total, daysCovered, now, money) : undefined,
      why: "Une maladie, une panne, un retard de salaire… Une réserve d'au moins un mois de dépenses t'évite d'emprunter dans l'urgence.",
      stats: [
        { label: "Ton argent aujourd'hui", value: money(total), tone: total > 0 ? 'good' : 'bad' },
        { label: 'Tes dépenses par mois', value: money(expense), tone: 'neutral' },
        { label: 'Pour 3 mois de réserve', value: money(expense * 3), tone: 'neutral' },
      ],
      rules: [
        { when: '3 mois de dépenses ou plus', points: 15, active: points === 15 },
        { when: 'De 1 à 3 mois', points: 10, active: points === 10 },
        { when: "Au moins 2 semaines", points: 5, active: points === 5 },
        { when: 'Moins de 2 semaines', points: 0, active: points === 0 },
      ],
      meter: { value: Math.min(months, 4), max: 4, marks: [{ at: 1, label: '1 mois' }, { at: 2, label: '2 mois' }, { at: 3, label: '3 mois' }] },
      action: { label: 'Créer un objectif « Réserve »', page: 'goals', goal: reserveGoal(expense, total, now, money) },
    };
    parts.push(p);
    addTip(p, 'Garde une réserve');
  }

  // 5. Régularité (10) : jours avec au moins une opération notée, sur les 14 derniers
  {
    const max = 10;
    const noted = new Set(transactions.filter((t) => at(t) <= now.getTime() && t.type !== 'adjustment').map((t) => ymd(new Date(t.createdAt))));
    const list = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13 + i);
      return { day: ymd(d), on: noted.has(ymd(d)) };
    });
    const days = list.filter((d) => d.on).length;
    const points = days >= 10 ? 10 : days >= 5 ? 6 : days >= 2 ? 3 : 0;
    const p: HealthPart = {
      id: 'regular',
      label: 'Régularité',
      points,
      max,
      text: `Opérations notées ${days} jour${days > 1 ? 's' : ''} sur les 14 derniers.`,
      tip: points < 10 ? 'Note tes dépenses chaque jour, même les petites : ton bilan sera plus juste.' : undefined,
      why: 'Plus tu notes régulièrement, plus tes chiffres sont justes. Les petites dépenses oubliées finissent par faire une grosse somme.',
      stats: [{ label: 'Jours notés (14 derniers)', value: `${days} sur 14`, tone: days >= 10 ? 'good' : days >= 5 ? 'warn' : 'bad' }],
      rules: [
        { when: '10 jours ou plus', points: 10, active: points === 10 },
        { when: 'De 5 à 9 jours', points: 6, active: points === 6 },
        { when: 'De 2 à 4 jours', points: 3, active: points === 3 },
        { when: 'Moins de 2 jours', points: 0, active: points === 0 },
      ],
      days: list,
      action: { label: 'Voir mes opérations', page: 'history' },
    };
    parts.push(p);
    addTip(p, 'Note chaque jour');
  }

  // Conseil en plus : la catégorie qui a le plus augmenté par rapport aux 2 mois d'avant
  {
    const parentOf = (id?: string) => {
      const c = categories.find((x) => x.id === id);
      return c?.parentId ?? c?.id;
    };
    const sum = (from: number, to: number) => {
      const m = new Map<string, number>();
      for (const t of real) {
        if (t.amount >= 0 || at(t) <= from || at(t) > to) continue;
        const k = parentOf(t.categoryId) ?? t.category;
        m.set(k, (m.get(k) ?? 0) - main(t));
      }
      return m;
    };
    const cur = sum(t30, now.getTime());
    const before = sum(t30 - 60 * DAY, t30);
    let best: { id: string; name: string; pct: number; extra: number; now: number; usual: number } | null = null;
    for (const [k, v] of cur) {
      const usual = (before.get(k) ?? 0) / 2;
      if (usual <= 0 || v < usual * 1.2 || v - usual < expense * 0.05) continue;
      const pct = Math.round((v / usual - 1) * 100);
      if (!best || v - usual > best.extra) best = { id: k, name: categories.find((c) => c.id === k)?.name ?? k, pct, extra: v - usual, now: v, usual };
    }
    if (best) {
      const how = best.pct >= 200 ? `ont été multipliées par ${Math.round(best.pct / 100 + 1)}` : best.pct >= 100 ? 'ont doublé' : `ont augmenté de ${best.pct} %`;
      tips.push({
        text: `Tes dépenses « ${best.name} » ${how} (${money(best.extra)} de plus que d'habitude). Un budget pourrait t'aider.`,
        title: `« ${best.name} » augmente`,
        part: 'trend',
        why: "Wallo compare tes 30 derniers jours à la moyenne des deux mois d'avant. Une dépense qui grimpe vite est souvent la plus facile à réduire.",
        stats: [
          { label: 'Ces 30 jours', value: money(best.now), tone: 'bad' },
          { label: "D'habitude (par mois)", value: money(best.usual), tone: 'neutral' },
          { label: 'En plus', value: `+${money(best.extra)}`, tone: 'bad' },
        ],
        // Budget à son niveau d'habitude (si la catégorie existe encore et n'a pas déjà un budget du mois)
        action: {
          label: 'Créer un budget',
          page: 'budgets',
          budget: categories.some((c) => c.id === best.id) ? { categoryId: best.id, amount: niceBudget(best.usual) } : undefined,
        },
        weight: 8,
      });
    }
  }

  // Prévisions, vérifications, objectifs : conseils calculés sur tes chiffres (healthInsights.ts)
  tips.push(...smartTips({ real, transactions, wallets, budgets, categories, settings, debts, expense, money, now }));

  const score = Math.round(parts.reduce((s, p) => s + p.points, 0));
  const level = score >= 80 ? 'great' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'weak';
  const label = { great: 'Excellente', good: 'Bonne', fair: 'À améliorer', weak: 'Fragile' }[level];
  if (!tips.length)
    tips.push({
      text: 'Tout va bien : continue comme ça, et pense à augmenter un peu ton épargne quand tu peux.',
      title: 'Continue comme ça',
      part: 'savings',
      why: 'Toutes les parties de ta note sont au vert. Augmenter un peu ton épargne chaque mois te rapprochera plus vite de tes objectifs.',
      action: { label: 'Voir mes objectifs', page: 'goals' },
      weight: 0,
    });
  return { score, level, label, parts, tips: tips.sort((a, b) => b.weight - a.weight) };
}

export const HEALTH_COLOR: Record<Health['level'], string> = { great: '#10B981', good: '#22C55E', fair: '#F59E0B', weak: '#EF4444' };
export const TONE_COLOR: Record<Tone, string> = { good: '#10B981', warn: '#F59E0B', bad: '#EF4444', neutral: '#64748B' };

// Conseil de la semaine : change chaque semaine parmi les plus utiles (les 3 premiers)
export function weeklyTipIndex(h: Health, now = new Date()): number {
  const week = Math.floor(now.getTime() / (7 * DAY));
  return week % Math.min(3, h.tips.length);
}

// Historique : un score par semaine (pour « +5 depuis la semaine dernière »)
const KEY = 'ap.healthHistory';
export function rememberScore(score: number, now = new Date()): number | null {
  const week = String(Math.floor(now.getTime() / (7 * DAY)));
  try {
    const h: Record<string, number> = JSON.parse(localStorage.getItem(KEY) || '{}');
    h[week] = score;
    const keys = Object.keys(h).sort().slice(-12);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, h[k]]))));
    const prev = h[String(Number(week) - 1)];
    return typeof prev === 'number' ? score - prev : null;
  } catch {
    return null;
  }
}

// Objectif « Réserve d'urgence » prêt à créer. Première marche : 1 mois de dépenses si la réserve couvre
// moins d'un mois, sinon 3 mois. Réparti sur ~6 mois, avec un rappel chaque vendredi.
function reserveGoal(expense: number, have: number, now: Date, money: (v: number) => string): GoalDraft | undefined {
  if (expense <= 0) return undefined;
  const cover = Math.max(0, have) / expense;
  const monthsGoal = cover < 1 ? 1 : 3;
  const target = niceBudget(expense * monthsGoal);
  // L'objectif démarre à 0 : le montant de la semaine couvre tout l'objectif
  const weeks = 26;
  const weekly = niceBudget(target / weeks);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + weeks * 7);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    name: 'Réserve d’urgence',
    goalAmount: target,
    goalDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    goalWhy: 'Pour les imprévus : maladie, panne, retard de salaire.',
    icon: 'PiggyBank',
    color: '#10B981',
    weekly,
    note: `${monthsGoal === 1 ? '1 mois' : '3 mois'} de tes dépenses (${money(expense)} par mois). Avec ${money(weekly)} par semaine, c’est fait en 6 mois. Tu peux tout changer.`,
  };
}

// Dépenses > revenus : de combien, et la dépense sur laquelle agir en premier
function overspendTip(over: number, last30: Transaction[], categories: Category[], main: (t: Transaction) => number, money: (v: number) => string): string {
  const by = new Map<string, number>();
  for (const t of last30) {
    if (t.amount >= 0) continue;
    const c = categories.find((x) => x.id === t.categoryId);
    const k = c?.parentId ?? c?.id;
    if (k && k !== 'other-expense') by.set(k, (by.get(k) ?? 0) - main(t)); // « Autres » : on ne sait pas quoi conseiller
  }
  const top = [...by].sort((a, b) => b[1] - a[1])[0];
  const name = top && categories.find((c) => c.id === top[0])?.name;
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  // Presque à l'équilibre : on ne parle pas d'un dépassement de « 0 $ »
  const head = over < Math.max(1, total * 0.02) ? 'Tu dépenses tout ce que tu gagnes : rien n’est mis de côté.' : `Tu as dépensé ${money(over)} de plus que tes revenus en 30 jours.`;
  if (!top || !name) return `${head} Commence par mettre une petite somme de côté chaque semaine, même très petite.`;
  return `${head} Ta plus grosse dépense est « ${name} » (${money(top[1])}) : la baisser de 15 % te ferait garder ${money(top[1] * 0.15)} par mois.`;
}

// Réserve faible : ce qu'elle couvre aujourd'hui, et combien mettre de côté par semaine
function cushionTip(expense: number, have: number, days: number, now: Date, money: (v: number) => string): string {
  const goal = reserveGoal(expense, have, now, money);
  if (!goal) return 'Garde une réserve pour les imprévus : vise au moins 1 mois de dépenses de côté.';
  const cover = days >= 1 ? `Ton argent couvre ${days} jour${days > 1 ? 's' : ''} de dépenses.` : 'Ton argent ne couvre presque aucun jour de dépenses.';
  return `${cover} Mets ${money(goal.weekly)} de côté chaque semaine : en 6 mois, tu auras ${money(goal.goalAmount)} pour les imprévus.`;
}
