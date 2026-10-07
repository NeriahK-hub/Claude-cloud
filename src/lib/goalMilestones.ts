import { Transaction, Wallet } from '../types';
import { Flag, PartyPopper, Rocket, Sprout, type LucideIcon } from 'lucide-react';
import { walletBalance } from './money';

// Paliers des portefeuilles objectifs (25 / 50 / 75 / 100 %) : chacun n'est fêté qu'une fois.
// Mémorisé sur cet appareil : { [id du portefeuille]: { level, goal } }. Si le montant visé change,
// on repart du palier actuel sans fêter (sinon relever l'objectif empêcherait toute nouvelle fête).

export const LEVELS = [25, 50, 75, 100] as const;
export type MilestoneLevel = (typeof LEVELS)[number];

const KEY = 'ap.goalMilestones';
type Store = Record<string, { level: number; goal: number }>;

function read(): Store | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : null;
  } catch {
    return null;
  }
}
function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // stockage bloqué : on risque seulement de refêter un palier plus tard
  }
}

// Plus haut palier atteint pour une progression (0 = aucun)
export const levelOf = (ratio: number): number => LEVELS.filter((l) => ratio * 100 >= l).pop() ?? 0;

export interface Crossing {
  wallet: Wallet;
  level: MilestoneLevel;
  saved: number;
}

// Compare la progression actuelle aux paliers déjà fêtés ; renvoie les nouveaux et les mémorise.
// Premier passage (ou objectif jamais vu / modifié) : on mémorise sans fêter, pas de rafale au lancement.
export function checkMilestones(wallets: Wallet[], transactions: Transaction[]): Crossing[] {
  const prev = read();
  const next: Store = {};
  const crossings: Crossing[] = [];
  for (const w of wallets) {
    if (w.kind !== 'goal' || !w.goalAmount || w.goalAmount <= 0) continue;
    const saved = Math.max(0, walletBalance(w, transactions));
    const level = levelOf(saved / w.goalAmount);
    const known = prev?.[w.id];
    if (!prev || !known || known.goal !== w.goalAmount || w.archived) {
      next[w.id] = { level, goal: w.goalAmount };
      continue;
    }
    // Un retrait ne fait pas redescendre le palier fêté : repasser 50 % ne refête pas
    next[w.id] = { level: Math.max(level, known.level), goal: w.goalAmount };
    if (level > known.level) crossings.push({ wallet: w, level: level as MilestoneLevel, saved });
  }
  write(next);
  return crossings;
}

// Objectif proposé par Wallo (ex. « Réserve d'urgence » depuis la Santé financière) : formulaire déjà rempli
export interface GoalDraft {
  name: string;
  goalAmount: number; // devise principale
  goalDate: string; // AAAA-MM-JJ
  goalWhy: string;
  icon: string;
  color: string;
  weekly: number; // rappel chaque semaine : montant à mettre de côté
  note: string; // une phrase : pourquoi ces chiffres
}

// « Créer le prochain objectif » : la page Objectifs s'ouvre avec le formulaire (rempli si draft)
let newGoalRequested: { draft: GoalDraft | null } | null = null;
export const requestNewGoal = (draft: GoalDraft | null = null) => {
  newGoalRequested = { draft };
};
export const consumeNewGoalRequest = () => {
  const r = newGoalRequested;
  newGoalRequested = null;
  return r;
};

export const MILESTONE_TEXT: Record<MilestoneLevel, { title: string; Icon: LucideIcon }> = {
  25: { title: 'Un quart du chemin !', Icon: Sprout },
  50: { title: 'La moitié du chemin !', Icon: Flag },
  75: { title: 'Plus que 25 % !', Icon: Rocket },
  100: { title: 'Objectif atteint !', Icon: PartyPopper },
};

// « Ajouter de l'argent » demandé de l'extérieur (notification du rappel, alerte) : la page Objectifs
// l'ouvre en arrivant, avec le montant proposé
let depositRequest: { walletId: string; amount?: number } | null = null;
export const requestDeposit = (walletId: string, amount?: number) => {
  depositRequest = { walletId, amount };
};
export const consumeDepositRequest = () => {
  const r = depositRequest;
  depositRequest = null;
  return r;
};

// Arrondis déjà versés cette semaine : { [id de l'objectif]: { week, amount } } (cet appareil).
// Si de nouvelles dépenses arrivent après, on ne propose que la différence.
const ROUND_KEY = 'ap.roundUpDone';
type RoundStore = Record<string, { week: string; amount: number }>;
const readRound = (): RoundStore => {
  try {
    return JSON.parse(localStorage.getItem(ROUND_KEY) ?? '{}') as RoundStore;
  } catch {
    return {};
  }
};
export function roundUpAlreadyPaid(goalId: string, week: string): number {
  const r = readRound()[goalId];
  return r && r.week === week ? r.amount : 0;
}
export function markRoundUpPaid(goalId: string, week: string, amount: number) {
  const all = readRound();
  const before = all[goalId]?.week === week ? all[goalId].amount : 0;
  all[goalId] = { week, amount: before + amount };
  try {
    localStorage.setItem(ROUND_KEY, JSON.stringify(all));
  } catch {
    // pas grave : on reproposera
  }
}

// Ouvrir le détail d'un objectif en arrivant sur la page Objectifs (notification touchée)
let viewRequest: string | null = null;
export const requestViewGoal = (walletId: string) => {
  viewRequest = walletId;
};
export const consumeViewGoal = () => {
  const r = viewRequest;
  viewRequest = null;
  return r;
};
