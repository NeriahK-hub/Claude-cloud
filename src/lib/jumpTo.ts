// « Aller à l'endroit exact » depuis un conseil (Santé financière) : l'écran visé lit la demande
// en arrivant et ouvre directement le bon portefeuille, budget ou dette.
// (Objectifs : requestDeposit / requestViewGoal de goalMilestones.ts ; opération : onSelectTransaction.)

export type Jump =
  | { kind: 'wallet'; id: string; adjust?: boolean } // adjust : ouvrir aussi « Corriger le solde »
  | { kind: 'budget'; id: string }
  | { kind: 'debt'; key: string }
  | { kind: 'goal'; id: string; deposit?: number } // deposit : « Ajouter de l'argent » avec ce montant
  | { kind: 'tx'; id: string };

let pending: Jump | null = null;

export const requestJump = (j: Jump | null) => {
  pending = j;
};

// Lu par l'écran visé ; effacé une fois lu (un seul écran le prend)
export function takeJump<K extends Jump['kind']>(kind: K): Extract<Jump, { kind: K }> | null {
  if (pending?.kind !== kind) return null;
  const j = pending as Extract<Jump, { kind: K }>;
  pending = null;
  return j;
}
