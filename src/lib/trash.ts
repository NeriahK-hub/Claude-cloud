import { useSyncExternalStore } from 'react';
import { Budget, Recurring, Transaction } from '../types';
import { uuid } from './ids';

// Corbeille : ce qu'on supprime reste 30 jours sur cet appareil et peut être rétabli
// (Paramètres › Corbeille, ou « Annuler » juste après la suppression).
// Les éléments rétablis reçoivent un nouvel identifiant : le compte en ligne a déjà reçu la suppression.

export const TRASH_DAYS = 30;
const KEY = 'ap.trash';
const MAX = 200;

export type TrashItem = { id: string; at: string; label: string } & (
  | { kind: 'transactions'; txs: Transaction[] }
  | { kind: 'budget'; budget: Budget }
  | { kind: 'recurring'; recurring: Recurring }
);
export type NewTrashItem = { label: string } & (
  | { kind: 'transactions'; txs: Transaction[] }
  | { kind: 'budget'; budget: Budget }
  | { kind: 'recurring'; recurring: Recurring }
);

const listeners = new Set<() => void>();
let items: TrashItem[] = read();

function read(): TrashItem[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as TrashItem[];
    const limit = Date.now() - TRASH_DAYS * 86400000;
    return all.filter((x) => new Date(x.at).getTime() > limit);
  } catch {
    return [];
  }
}
function save(next: TrashItem[]) {
  items = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // corbeille gardée pour cette session
  }
  listeners.forEach((l) => l());
}

export const getTrash = () => items;
export const trashAdd = (item: NewTrashItem): string => {
  const id = uuid();
  save([{ ...item, id, at: new Date().toISOString() } as TrashItem, ...items].slice(0, MAX));
  return id;
};
export const trashRemove = (id: string) => save(items.filter((x) => x.id !== id));
export const trashClear = () => save([]);
export const daysLeft = (x: TrashItem) => Math.max(0, Math.ceil((new Date(x.at).getTime() + TRASH_DAYS * 86400000 - Date.now()) / 86400000));

export function useTrash(): TrashItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items
  );
}
