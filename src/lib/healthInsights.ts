import { Budget, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { toMain, walletBalance } from './money';
import { budgetStatus, existedIn, budgetRange, periodOf } from './budgets';
import { DebtEntry } from './debts';
import { niceBudget } from './budgetDraft';
import type { HealthTip } from './health';

// Conseils « intelligents » de la Santé financière : calculés sur tes vrais chiffres, avec une date,
// un montant et un bouton qui prépare l'action. Trois familles :
// • Prévisions : un budget qui va déborder, la fin du mois avant le prochain revenu
// • Vérifications : portefeuille en négatif, doublon probable, dépenses mal rangées
// • Objectifs et dettes : objectif en retard, dette à rendre bientôt, argent qu'on te doit
// Rien n'est envoyé : tout est calculé sur le téléphone.

const DAY = 86400000;
const dm = (d: Date) => `${d.getDate() === 1 ? '1er' : d.getDate()} ${['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][d.getMonth()]}`;
const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);

export function smartTips(args: {
  real: Transaction[]; // vraies entrées / sorties (sans transferts ni dettes)
  transactions: Transaction[];
  wallets: Wallet[];
  budgets: Budget[];
  categories: Category[];
  settings: Settings;
  debts: DebtEntry[];
  expense: number; // dépenses des 30 derniers jours (devise principale)
  money: (v: number) => string;
  now: Date;
}): HealthTip[] {
  const { real, transactions, wallets, budgets, categories, settings, debts, expense, money, now } = args;
  const tips: HealthTip[] = [];
  const main = (t: Transaction) => toMain(t.amount, t.currency, settings);
  const at = (t: Transaction) => new Date(t.createdAt).getTime();
  const catName = (id: string | null | undefined) => (id ? categories.find((c) => c.id === id)?.name ?? 'Budget' : 'Toutes les dépenses');

  // ---------- Prévision : un budget qui va déborder à ce rythme ----------
  const today = startOfDay(now);
  for (const b of budgets) {
    if (periodOf(b) === 'custom' || !existedIn(b, budgetRange(b, 0, now))) continue;
    const st = budgetStatus(b, transactions, categories, settings, 0, now);
    if (st.ratio >= 1 || st.spent <= 0) continue; // déjà dépassé : la partie Budgets le dit
    const span = st.end.getTime() - st.start.getTime();
    const elapsed = (now.getTime() - st.start.getTime()) / span;
    if (elapsed < 0.2 || elapsed > 0.95) continue; // trop tôt pour juger, ou presque fini
    if (st.ratio / elapsed < 1.15) continue; // dans les temps
    const overAt = new Date(st.start.getTime() + (now.getTime() - st.start.getTime()) / st.ratio);
    if (overAt >= st.end) continue;
    const daysLeft = Math.max(1, daysBetween(today, st.end));
    const left = toMain(st.left, b.currency, settings);
    tips.push({
      title: `« ${catName(b.categoryId)} » va déborder`,
      text: `À ce rythme, ton budget « ${catName(b.categoryId)} » sera dépassé vers le ${dm(overAt)}. Il te reste ${money(left)} pour ${daysLeft} jour${daysLeft > 1 ? 's' : ''} : environ ${money(left / daysLeft)} par jour.`,
      part: 'forecast',
      why: 'Wallo compare ce que tu as déjà dépensé au temps écoulé. Ralentir maintenant est bien plus facile que rattraper après le dépassement.',
      stats: [
        { label: 'Déjà dépensé', value: `${Math.round(st.ratio * 100)} %`, tone: 'warn' },
        { label: 'Temps écoulé', value: `${Math.round(elapsed * 100)} %`, tone: 'neutral' },
        { label: 'Par jour pour tenir', value: money(left / daysLeft), tone: 'good' },
      ],
      action: { label: 'Voir mes budgets', page: 'budgets' },
      weight: 11,
    });
  }

  // ---------- Prévision : tiendras-tu jusqu'au prochain revenu ? ----------
  // Jour de paie habituel : un gros revenu revenu au même moment du mois (±3 jours) au moins 2 mois sur 3
  {
    const since = now.getTime() - 92 * DAY;
    const incomes = real.filter((t) => t.amount > 0 && at(t) > since && at(t) <= now.getTime());
    const total = incomes.reduce((s, t) => s + main(t), 0);
    const big = incomes.filter((t) => main(t) >= total * 0.2);
    let payday: number | null = null;
    for (const t of big) {
      const d = new Date(t.createdAt).getDate();
      const months = new Set(big.filter((x) => Math.abs(new Date(x.createdAt).getDate() - d) <= 3).map((x) => new Date(x.createdAt).getMonth()));
      if (months.size >= 2) {
        payday = d;
        break;
      }
    }
    const cash = wallets
      .filter((w) => !w.archived && w.includeInTotal && (w.kind ?? 'basic') === 'basic')
      .reduce((s, w) => s + toMain(walletBalance(w, transactions), w.currency, settings), 0);
    const daily = expense / 30;
    if (payday && daily > 0 && cash > 0) {
      let next = new Date(now.getFullYear(), now.getMonth(), payday);
      if (next <= today) next = new Date(now.getFullYear(), now.getMonth() + 1, payday);
      const until = daysBetween(today, next);
      const lasts = Math.floor(cash / daily);
      if (until > 0 && lasts < until) {
        const short = daily * until - cash;
        tips.push({
          title: 'Jusqu’au prochain revenu',
          text: `Ton argent tiendra environ ${lasts} jour${lasts > 1 ? 's' : ''} à ce rythme, mais ton prochain revenu arrive vers le ${dm(next)}. Vise ${money(cash / until)} par jour au plus, ou il manquera ${money(short)}.`,
          part: 'forecast',
          why: 'Wallo repère le jour où tes revenus arrivent d’habitude et le compare à ce que tu dépenses par jour. Le savoir tôt laisse le temps de s’organiser.',
          stats: [
            { label: 'Argent disponible', value: money(cash), tone: 'neutral' },
            { label: 'Dépense moyenne par jour', value: money(daily), tone: 'warn' },
            { label: 'Par jour pour tenir', value: money(cash / until), tone: 'good' },
          ],
          action: { label: 'Voir le rapport', page: 'statistic' },
          weight: 12,
        });
      }
    }
  }

  // ---------- Vérification : portefeuille en négatif (opération oubliée ?) ----------
  for (const w of wallets) {
    if (w.archived || (w.kind ?? 'basic') !== 'basic') continue;
    const bal = walletBalance(w, transactions);
    if (bal >= -0.004) continue;
    tips.push({
      title: `« ${w.name} » est en négatif`,
      text: `Le portefeuille « ${w.name} » affiche ${money(toMain(bal, w.currency, settings))}. Une entrée oubliée ? Ajoute-la, ou corrige le solde.`,
      part: 'check',
      why: 'De l’argent liquide ou du Mobile Money ne peut pas descendre sous zéro : un solde négatif veut souvent dire qu’une opération manque, et tous tes chiffres sont faussés.',
      action: { label: 'Voir mes portefeuilles', page: 'wallets' },
      weight: 9,
    });
    break; // un seul à la fois : le plus important d'abord
  }

  // ---------- Vérification : doublon probable (même montant, même nom, à la même minute) ----------
  {
    const recent = real.filter((t) => at(t) > now.getTime() - 30 * DAY).sort((a, b) => at(a) - at(b));
    for (let i = 1; i < recent.length; i++) {
      const a = recent[i - 1];
      const b = recent[i];
      if (a.walletId === b.walletId && a.amount === b.amount && a.title.trim() === b.title.trim() && Math.abs(at(b) - at(a)) < 60_000) {
        tips.push({
          title: 'Un doublon ?',
          text: `« ${b.title} » (${money(Math.abs(main(b)))}) est noté deux fois le ${dm(new Date(b.createdAt))}, à la même minute. Si c’est une erreur, supprimes-en un.`,
          part: 'check',
          why: 'Une opération enregistrée deux fois fausse ton solde, ton rapport et ta note.',
          action: { label: 'Voir mes opérations', page: 'history' },
          weight: 6,
        });
        break;
      }
    }
  }

  // ---------- Vérification : trop de dépenses dans « Autres » ----------
  {
    const out = real.filter((t) => t.amount < 0 && at(t) > now.getTime() - 30 * DAY);
    const other = out.filter((t) => t.categoryId === 'other-expense');
    const sumOther = other.reduce((s, t) => s - main(t), 0);
    if (other.length >= 5 && expense > 0 && sumOther / expense >= 0.25) {
      tips.push({
        title: 'Range tes dépenses',
        text: `${Math.round((sumOther / expense) * 100)} % de tes dépenses (${money(sumOther)}) sont dans « Autres dépenses ». Range-les : les conseils seront plus justes.`,
        part: 'check',
        why: 'Wallo ne peut pas te dire où part ton argent si une grosse partie est rangée dans « Autres ».',
        action: { label: 'Voir mes opérations', page: 'history' },
        weight: 3,
      });
    }
  }

  // ---------- Prévision : une catégorie prend presque la moitié des dépenses (et n'a pas de budget) ----------
  if (budgets.length && expense > 0) {
    const by = new Map<string, number>();
    for (const t of real) {
      if (t.amount >= 0 || at(t) <= now.getTime() - 30 * DAY) continue;
      const c = categories.find((x) => x.id === t.categoryId);
      const k = c?.parentId ?? c?.id;
      if (k && k !== 'other-expense') by.set(k, (by.get(k) ?? 0) - main(t));
    }
    const top = [...by].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / expense >= 0.4 && !budgets.some((b) => b.categoryId === top[0])) {
      tips.push({
        title: `« ${catName(top[0])} » prend beaucoup`,
        text: `« ${catName(top[0])} » représente ${Math.round((top[1] / expense) * 100)} % de tes dépenses (${money(top[1])} en 30 jours), sans budget. Un budget t’aiderait à la garder sous contrôle.`,
        part: 'forecast',
        why: 'Quand une seule dépense pèse presque la moitié du total, la réduire un peu fait plus d’effet que tout le reste.',
        action: { label: 'Créer ce budget', page: 'budgets', budget: { categoryId: top[0], amount: niceBudget(top[1] * 0.9) } },
        weight: 6,
      });
    }
  }

  // ---------- Objectifs : en retard sur la date visée ----------
  for (const w of wallets) {
    if (w.archived || w.kind !== 'goal' || !w.goalAmount || !w.goalDate) continue;
    const saved = walletBalance(w, transactions);
    const missing = w.goalAmount - saved;
    if (missing <= 0.004) continue;
    const end = fromYmd(w.goalDate);
    const weeksLeft = daysBetween(today, end) / 7;
    // Ce que tu y mets en moyenne par semaine (8 dernières semaines)
    const put = transactions
      .filter((t) => t.walletId === w.id && t.amount > 0 && at(t) > now.getTime() - 56 * DAY && at(t) <= now.getTime())
      .reduce((s, t) => s + t.amount, 0) / 8;
    if (weeksLeft <= 0) {
      tips.push({
        title: `« ${w.name} » : date passée`,
        text: `La date de ton objectif « ${w.name} » est passée, il manque encore ${money(toMain(missing, w.currency, settings))}. Choisis une nouvelle date réaliste pour garder le cap.`,
        part: 'goal',
        why: 'Un objectif avec une date à jour te dit combien mettre de côté chaque semaine.',
        action: { label: 'Voir mes objectifs', page: 'goals' },
        weight: 5,
      });
      continue;
    }
    const need = missing / Math.max(1, weeksLeft);
    if (need > put * 1.2 && weeksLeft < 104) {
      tips.push({
        title: `« ${w.name} » prend du retard`,
        text: `Pour « ${w.name} » avant le ${dm(end)}, il faut mettre ${money(toMain(need, w.currency, settings))} par semaine. Tu y mets ${money(toMain(put, w.currency, settings))} en moyenne.`,
        part: 'goal',
        why: 'Wallo compare ce qui manque au temps qui reste. Ajuster maintenant (un peu plus chaque semaine, ou une date plus tard) évite la mauvaise surprise.',
        stats: [
          { label: 'Il manque', value: money(toMain(missing, w.currency, settings)), tone: 'warn' },
          { label: 'Par semaine, il faut', value: money(toMain(need, w.currency, settings)), tone: 'neutral' },
          { label: 'Tu mets en moyenne', value: money(toMain(put, w.currency, settings)), tone: put > 0 ? 'good' : 'bad' },
        ],
        action: { label: 'Voir mes objectifs', page: 'goals' },
        weight: 7,
      });
    }
  }

  // ---------- Dettes : à rendre bientôt / argent qu'on te doit en retard ----------
  for (const d of debts) {
    if (!d.due || d.left <= 0.004) continue;
    const due = fromYmd(d.due);
    const inDays = daysBetween(today, due);
    if (d.side === 'payable' && inDays >= 0 && inDays <= 7) {
      tips.push({
        title: inDays === 0 ? 'À rendre aujourd’hui' : 'À rendre bientôt',
        text: `Tu dois rendre ${money(d.left)} à ${d.name} ${inDays === 0 ? 'aujourd’hui' : inDays === 1 ? 'demain' : `avant le ${dm(due)}`}. Prévois-le dès maintenant.`,
        part: 'debts',
        why: 'Rendre à temps garde la confiance, et évite les intérêts ou les tensions.',
        action: { label: 'Voir mes dettes', page: 'debts' },
        weight: inDays <= 1 ? 10 : 7,
      });
    }
    if (d.side === 'receivable' && inDays < 0) {
      tips.push({
        title: `${d.name} te doit encore`,
        text: `${d.name} devait te rendre ${money(d.left)} le ${dm(due)}. Un petit rappel gentil ?`,
        part: 'debts',
        why: 'L’argent prêté et pas rendu manque dans ton budget. Un rappel tôt est plus simple qu’après des mois.',
        action: { label: 'Voir mes dettes', page: 'debts' },
        weight: 4,
      });
    }
  }

  // « 28 oct.. » : une date abrégée en fin de phrase garde un seul point
  return tips.map((t) => ({ ...t, text: t.text.replace(/\.\./g, '.') }));
}
