// Calculs d'une ristourne : dates des tours, tour en cours, qui a payé.
import { Ristourne, RistourneMember } from '../types';

const STEP_DAYS = { weekly: 7, biweekly: 14 } as const;

export const FREQUENCIES: { id: Ristourne['frequency']; label: string; every: string }[] = [
  { id: 'weekly', label: 'Chaque semaine', every: 'semaine' },
  { id: 'biweekly', label: 'Toutes les 2 semaines', every: '2 semaines' },
  { id: 'monthly', label: 'Chaque mois', every: 'mois' },
  { id: 'custom', label: 'Personnalisée', every: 'jours' },
];

// Nombre de jours d'une fréquence personnalisée (1 à 365)
export const customDays = (r: Pick<Ristourne, 'everyDays'>) => Math.min(365, Math.max(1, Math.round(r.everyDays ?? 1)));

// « chaque semaine », « tous les 3 jours », « chaque jour »…
export function frequencyText(r: Pick<Ristourne, 'frequency' | 'everyDays'>): string {
  if (r.frequency === 'custom') {
    const n = customDays(r);
    return n === 1 ? 'chaque jour' : `tous les ${n} jours`;
  }
  return FREQUENCIES.find((f) => f.id === r.frequency)!.label.toLowerCase();
}

export const activeMembers = (r: Ristourne): RistourneMember[] => r.members.filter((m) => !m.removed).sort((a, b) => a.turn - b.turn);

// Date du tour n (1 = le premier)
export function turnDate(r: Ristourne, n: number): Date {
  const [y, m, d] = r.startDate.split('-').map(Number);
  if (r.frequency === 'monthly') return new Date(y, m - 1 + (n - 1), d);
  const step = r.frequency === 'custom' ? customDays(r) : STEP_DAYS[r.frequency];
  return new Date(y, m - 1, d + (n - 1) * step);
}

// Tour en cours : le premier dont la date n'est pas encore passée (le jour même compte)
export function currentTurn(r: Ristourne, now = new Date()): number {
  const n = activeMembers(r).length;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let t = 1; t <= n; t++) if (turnDate(r, t) >= today) return t;
  return n; // tous les tours sont passés : on reste sur le dernier
}

export const isFinished = (r: Ristourne, now = new Date()) => {
  const n = activeMembers(r).length;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return n > 0 && turnDate(r, n) < today;
};

export const beneficiary = (r: Ristourne, turn: number) => activeMembers(r).find((m) => m.turn === turn);

// Paiements d'un tour, par membre. Seul l'argent confirmé compte dans la cagnotte ;
// un paiement noté par un membre reste « à confirmer » tant que l'organisateur / le gardien ne l'a pas vérifié.
export function turnStatus(r: Ristourne, turn: number) {
  const members = activeMembers(r);
  const paidBy = new Map<string, number>(); // confirmé
  const pendingBy = new Map<string, number>(); // à confirmer
  for (const p of r.payments) {
    if (p.turn !== turn) continue;
    const map = p.pending ? pendingBy : paidBy;
    map.set(p.memberId, (map.get(p.memberId) ?? 0) + p.amount);
  }
  const pot = members.length * r.contribution; // chacun cotise, y compris celui qui reçoit
  const collected = [...paidBy.values()].reduce((s, v) => s + v, 0);
  const pendingTotal = [...pendingBy.values()].reduce((s, v) => s + v, 0);
  const paidCount = members.filter((m) => (paidBy.get(m.id) ?? 0) >= r.contribution - 0.004).length;
  const pendingCount = members.filter((m) => (pendingBy.get(m.id) ?? 0) > 0).length;
  return { members, paidBy, pendingBy, pot, collected, pendingTotal, paidCount, pendingCount };
}

// L'organisateur : moi (ristourne créée ici) ou le membre lié au compte du propriétaire
export const organizer = (r: Ristourne) => activeMembers(r).find((m) => (r.ownerId ? m.userId === r.ownerId : m.isMe));

// Qui garde l'argent (choisi à la création, sinon l'organisateur)
export const keeperOf = (r: Ristourne) => activeMembers(r).find((m) => m.id === r.keeperId) ?? organizer(r);

// Puis-je confirmer les paiements ? (organisateur ou gardien de l'argent)
export const canConfirm = (r: Ristourne) => !r.ownerId || !!keeperOf(r)?.isMe;

// « en main », « sur un compte (M-Pesa 081…) »
export const holdingText = (r: Ristourne) =>
  r.holding === 'digital' ? `sur un compte${r.holdingDetails ? ` (${r.holdingDetails})` : ''}` : r.holding === 'cash' ? 'en main (espèces)' : '';

// Le 1er tour : prochain jour « rond » à partir d'aujourd'hui
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
