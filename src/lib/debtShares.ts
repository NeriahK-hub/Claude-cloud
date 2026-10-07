// Dettes partagées : ce que chacun voit à partir du carnet commun (voir supabase/migrations/…_shared_debts.sql)
import { DebtMove, DebtShare, Settings } from '../types';
import { convertBetween } from './money';
import { currentRound, DEBT_CATEGORY, DebtSide } from './debts';

// Les deux suivent la dette : un mouvement ne compte qu'une fois confirmé par l'autre
export const isLive = (s: DebtShare) => s.status === 'active' && !s.otherLeft;

// Mouvements qui comptent dans le reste. Seul à suivre (lien pas encore accepté, refusé, ou l'autre
// est parti) : c'est un simple carnet, tout compte.
export const countedMoves = (s: DebtShare) => s.moves.filter((m) => !isLive(s) || !m.pending);

// Mouvements notés par l'autre qui attendent ma réponse (confirmer, ou accepter une suppression)
export const waitingForMe = (s: DebtShare, me: string) =>
  isLive(s) ? s.moves.filter((m) => (m.pending && m.recordedBy !== me) || (!!m.deleteRequestedBy && m.deleteRequestedBy !== me)).length : 0;

// Devise de la dette partagée : celle du premier prêt. Les deux personnes voient les montants dans
// cette devise, sans passer par leur taux (sinon chacun voyait un chiffre différent)
export const shareCurrency = (s: DebtShare, fallback: string) =>
  (s.moves.find((m) => m.kind === 'more') ?? s.moves[0])?.currency ?? fallback;

export function shareTotals(s: DebtShare, settings: Settings) {
  const currency = shareCurrency(s, settings.mainCurrency);
  // Même devise : montant exact ; autre devise (rare) : converti avec le taux de ce téléphone
  const inCur = (m: DebtMove) => Math.abs(m.currency === currency ? m.amount : (convertBetween(m.amount, m.currency, currency, settings) ?? m.amount));
  // Tour en cours (voir currentRound) : calculé sur les mouvements qui comptent, par date → le même chez les deux
  const { current: counted } = currentRound(countedMoves(s), (m) => m.date, (m) => (m.kind === 'repay' ? -inCur(m) : inCur(m)));
  const since = counted[0]?.date ?? '';
  // Le tour en cours, plus les mouvements en attente arrivés depuis
  const current = s.moves.filter((m) => m.date >= since || !counted.length);
  let total = 0;
  let interest = 0;
  let paid = 0;
  for (const m of counted) {
    const v = inCur(m);
    if (m.kind === 'more') total += v;
    else if (m.kind === 'interest') interest += v;
    else paid += v;
  }
  const pending = isLive(s) ? s.moves.filter((m) => m.pending) : [];
  return { currency, total, interest, paid, left: Math.round((total + interest - paid) * 100) / 100, pending, current };
}

// Catégorie de l'opération à noter dans un portefeuille, et son sens (sortie ou entrée d'argent)
// (les intérêts ne passent pas par un portefeuille : ils arrivent ou partent avec les remboursements)
export const debtCategoryOf = (side: DebtSide, kind: DebtMove['kind']) => DEBT_CATEGORY[side][kind === 'more' ? 'more' : 'repay'];
export const movesMoney = (kind: DebtMove['kind']) => kind !== 'interest';
// Je prête (on me doit, la dette grandit) ou je rembourse (je dois, remboursement) : l'argent sort
export const debtMoneyOut = (side: DebtSide, kind: DebtMove['kind']) => (side === 'receivable') === (kind === 'more');

export const moveLabel = (side: DebtSide, kind: DebtMove['kind']) =>
  kind === 'more' ? (side === 'receivable' ? 'Prêt' : 'Emprunt') : kind === 'interest' ? 'Intérêts' : 'Remboursement';

// Intérêts : un montant, ou un pourcentage d'une base (le prêt, ou ce qu'il reste)
export function interestAmount(text: string, percent: boolean, base: number): number {
  const v = Number(text.replace(/\s/g, '').replace(',', '.'));
  if (!(v > 0)) return 0;
  return percent ? Math.round(base * v) / 100 : v;
}
