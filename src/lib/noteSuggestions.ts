// Suggestions pour la note d'une opération : les notes déjà écrites, les plus fréquentes
// et les plus récentes d'abord (comme la barre de suggestions du clavier de l'iPhone).
import { Transaction } from '../types';

export interface NoteHistoryItem {
  text: string;
  count: number; // nombre de fois utilisée
  last: number; // dernière utilisation (ms)
  cats: Record<string, number>; // catégorie -> nombre de fois
}

// Sans accents ni majuscules : « marche » trouve « Marché »
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Notes tapées par le passé (le titre d'une opération sans note est le nom de sa catégorie : ignoré)
export function buildNoteHistory(transactions: Transaction[]): NoteHistoryItem[] {
  const map = new Map<string, NoteHistoryItem>();
  for (const t of transactions) {
    if (t.type === 'transfer' || t.type === 'adjustment') continue;
    const text = t.title?.trim();
    if (!text || text === t.category || (t.withPerson && text === `${t.category} · ${t.withPerson}`)) continue;
    const key = norm(text);
    const at = new Date(t.createdAt).getTime() || 0;
    const cur = map.get(key) ?? { text, count: 0, last: 0, cats: {} };
    cur.count++;
    if (at > cur.last) {
      cur.last = at;
      cur.text = text; // l'écriture la plus récente
    }
    if (t.categoryId) cur.cats[t.categoryId] = (cur.cats[t.categoryId] ?? 0) + 1;
    map.set(key, cur);
  }
  return [...map.values()];
}

// Fréquence d'abord, puis récence (une note d'il y a un an pèse moins qu'une de la semaine)
const score = (x: NoteHistoryItem, now: number) => x.count + Math.max(0, 3 - (now - x.last) / (30 * 86400000));

export function suggestNotes(
  history: NoteHistoryItem[],
  typed: string,
  categoryIds: string[], // catégories de l'onglet (dépense, revenu, dette)
  selectedId: string,
  limit = 6
): NoteHistoryItem[] {
  const q = norm(typed);
  const inTab = new Set(categoryIds);
  const now = Date.now();
  const list = history.filter((x) => Object.keys(x.cats).some((c) => inTab.has(c)));
  if (!q) {
    // Rien de tapé : les notes habituelles de la catégorie choisie (écrites au moins 2 fois)
    return list
      .filter((x) => (x.cats[selectedId] ?? 0) >= 2)
      .sort((a, b) => (b.cats[selectedId] ?? 0) - (a.cats[selectedId] ?? 0) || b.last - a.last)
      .slice(0, limit);
  }
  return list
    .map((x) => {
      const n = norm(x.text);
      if (n === q) return null;
      // Début de la note > début d'un mot > ailleurs dans la note
      const rank = n.startsWith(q) ? 3 : n.split(/[\s'’-]+/).some((w) => w.startsWith(q)) ? 2 : n.includes(q) ? 1 : 0;
      if (!rank) return null;
      return { x, s: rank * 100 + score(x, now) + (x.cats[selectedId] ? 5 : 0) };
    })
    .filter((r): r is { x: NoteHistoryItem; s: number } => !!r)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.x);
}

// Montants déjà utilisés pour chaque catégorie (les plus récents d'abord, sans doublon) :
// proposés d'un toucher quand on choisit la catégorie.
export interface UsualAmount {
  amount: number;
  currency: string;
}
export function buildAmountHistory(transactions: Transaction[], perCategory = 3): Record<string, UsualAmount[]> {
  const out: Record<string, UsualAmount[]> = {};
  const sorted = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const t of sorted) {
    if (t.type === 'transfer' || t.type === 'adjustment' || !t.categoryId) continue;
    // Le montant tel qu'il a été tapé (dans sa devise d'origine si elle différait du portefeuille)
    const amount = Math.abs(t.originalAmount ?? t.amount);
    const currency = t.originalCurrency ?? t.currency;
    const list = (out[t.categoryId] ??= []);
    if (list.length < perCategory && amount > 0 && !list.some((x) => x.amount === amount && x.currency === currency)) list.push({ amount, currency });
  }
  return out;
}
