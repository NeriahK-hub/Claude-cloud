// Calculs d'une ristourne : dates des tours, tour en cours, qui a payé.
import { Ristourne, RistourneMember } from '../types';

const STEP_DAYS = { weekly: 7, biweekly: 14 } as const;

export const FREQUENCIES: { id: Ristourne['frequency']; label: string; every: string }[] = [
  { id: 'weekly', label: 'Chaque semaine', every: 'semaine' },
  { id: 'biweekly', label: 'Toutes les 2 semaines', every: '2 semaines' },
  { id: 'monthly', label: 'Chaque mois', every: 'mois' },
];

export const activeMembers = (r: Ristourne): RistourneMember[] => r.members.filter((m) => !m.removed).sort((a, b) => a.turn - b.turn);

// Date du tour n (1 = le premier)
export function turnDate(r: Ristourne, n: number): Date {
  const [y, m, d] = r.startDate.split('-').map(Number);
  if (r.frequency === 'monthly') return new Date(y, m - 1 + (n - 1), d);
  return new Date(y, m - 1, d + (n - 1) * STEP_DAYS[r.frequency]);
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

// Paiements d'un tour, par membre
export function turnStatus(r: Ristourne, turn: number) {
  const members = activeMembers(r);
  const paidBy = new Map<string, number>();
  for (const p of r.payments) if (p.turn === turn) paidBy.set(p.memberId, (paidBy.get(p.memberId) ?? 0) + p.amount);
  const pot = members.length * r.contribution; // chacun cotise, y compris celui qui reçoit
  const collected = [...paidBy.values()].reduce((s, v) => s + v, 0);
  const paidCount = members.filter((m) => (paidBy.get(m.id) ?? 0) >= r.contribution - 0.004).length;
  return { members, paidBy, pot, collected, paidCount };
}

// Le 1er tour : prochain jour « rond » à partir d'aujourd'hui
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
