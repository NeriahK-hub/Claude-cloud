// Portefeuilles en double : même nom, même devise, même type, et exactement les mêmes opérations
// (copie complète créée par erreur, ex. deux onglets ou une fusion au premier branchement du compte).
import { Transaction, Wallet } from '../types';

export interface DuplicatePlan {
  groups: { keep: Wallet; remove: Wallet[] }[];
  walletIds: string[]; // portefeuilles à supprimer
  txIds: string[]; // leurs opérations (+ l'autre moitié de leurs transferts)
}

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Ce qui fait qu'une opération est « la même » (sans identifiant ni portefeuille)
const txKey = (t: Transaction) =>
  [t.type, Math.round(t.amount * 100), t.currency, t.createdAt, t.title, t.categoryId ?? t.category, t.withPerson ?? ''].join('|');

export function findDuplicateWallets(wallets: Wallet[], transactions: Transaction[]): DuplicatePlan {
  const byWallet = new Map<string, Transaction[]>();
  for (const t of transactions) byWallet.set(t.walletId, [...(byWallet.get(t.walletId) ?? []), t]);
  const signature = (w: Wallet) => (byWallet.get(w.id) ?? []).map(txKey).sort().join('\n');

  // Portefeuilles partagés ou vides : jamais touchés
  const candidates = wallets.filter((w) => !w.ownerId && !(w.members?.length) && (byWallet.get(w.id)?.length ?? 0) > 0);
  const buckets = new Map<string, Wallet[]>();
  for (const w of candidates) {
    const k = [norm(w.name), w.currency, w.kind ?? 'basic', signature(w)].join('§');
    buckets.set(k, [...(buckets.get(k) ?? []), w]);
  }

  const groups: DuplicatePlan['groups'] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    // On garde celui qui est actif (pas archivé), sinon le premier de la liste
    const keep = list.find((w) => !w.archived) ?? list[0];
    groups.push({ keep, remove: list.filter((w) => w !== keep) });
  }

  const walletIds = groups.flatMap((g) => g.remove.map((w) => w.id));
  const gone = new Set(walletIds);
  const removed = transactions.filter((t) => gone.has(t.walletId));
  // Un transfert vers un portefeuille gardé laisse sa 2e moitié (en double elle aussi) : on l'enlève avec
  const transfers = new Set(removed.map((t) => t.transferId).filter(Boolean));
  const txIds = transactions.filter((t) => gone.has(t.walletId) || (t.transferId && transfers.has(t.transferId))).map((t) => t.id);
  return { groups, walletIds, txIds };
}
