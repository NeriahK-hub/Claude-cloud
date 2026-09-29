// Moteur de synchronisation « hors ligne d'abord ».
// L'app garde tout sur le téléphone (localStorage) et reste utilisable sans réseau.
// Une synchro = 1) envoyer ce qui a changé ici depuis la dernière fois, 2) récupérer ce qui a changé
// dans la base (autres appareils, autres membres), 3) oublier les portefeuilles qu'on ne voit plus.
// Conflit (même opération modifiée à deux endroits) : la dernière modification envoyée l'emporte.
import { Budget, Ristourne, Transaction, Wallet } from '../../types';
import { Category } from '../../data/categories';
import { CustomIcon } from '../customIcons';
import { isUuid, uuid } from '../ids';
import {
  Row,
  SyncData,
  TableName,
  budgetFromRow,
  budgetRow,
  categoryFromRow,
  categoryRow,
  fingerprint,
  iconFromRow,
  iconRow,
  memberRows,
  mergeMembers,
  paymentFromRow,
  paymentRow,
  ristourneFromRow,
  ristourneMemberFromRow,
  ristourneMemberRows,
  ristourneRow,
  profileRow,
  settingsFromRow,
  transactionFromRow,
  transactionRow,
  walletFromRow,
  walletRow,
} from './mapping';

// Ce que la base sait faire (Supabase dans l'app, PostgreSQL local dans les tests)
export interface Remote {
  me: string;
  acceptInvites(): Promise<number>;
  pull(table: TableName, since: string | null): Promise<Row[]>; // lignes modifiées après `since`, suppressions comprises
  upsert(table: TableName, rows: Row[]): Promise<void>;
  softDelete(table: TableName, ids: string[]): Promise<void>;
  leaveWallet(id: string): Promise<void>;
  visibleWalletIds(): Promise<string[]>;
  leaveRistourne(id: string): Promise<void>;
  visibleRistourneIds(): Promise<string[]>;
}

// Mémoire de la synchro sur cet appareil
export interface SyncMeta {
  userId: string;
  cursors: Partial<Record<TableName, string>>; // dernière date updated_at reçue par table
  snap: Partial<Record<TableName, Record<string, string>>>; // empreinte de chaque ligne telle qu'envoyée / reçue
  foreignWallets: string[]; // portefeuilles partagés dont je ne suis pas propriétaire
  foreignRistournes?: string[]; // ristournes dont je ne suis pas propriétaire
}

export const emptyMeta = (userId: string): SyncMeta => ({ userId, cursors: {}, snap: {}, foreignWallets: [], foreignRistournes: [] });

// Changements à appliquer aux données locales (sur la version la plus récente, pas sur une copie)
export interface ListPatch<T> {
  upsert: T[];
  remove: string[];
  order?: string[]; // ordre complet (premier chargement)
}
export interface SyncPatch {
  replaceAll?: boolean;
  wallets?: ListPatch<Wallet>;
  transactions?: ListPatch<Transaction>;
  categories?: ListPatch<Category>;
  budgets?: ListPatch<Budget>;
  customIcons?: ListPatch<CustomIcon>;
  ristournes?: ListPatch<Ristourne>;
  settings?: SyncData['settings'];
  profileName?: string;
}

export type SyncResult =
  | { status: 'needs-decision'; remoteWallets: number }
  | { status: 'done'; patch: SyncPatch; meta: SyncMeta; pushed: number; pulled: number };

export function applyList<T extends { id: string }>(list: T[], p?: ListPatch<T>, replace = false): T[] {
  if (!p) return list;
  // Une suppression l'emporte toujours sur une mise à jour du même élément
  const removed = new Set(p.remove);
  const upsert = p.upsert.filter((x) => !removed.has(x.id));
  let out: T[];
  if (replace) out = upsert;
  else {
    const incoming = new Map(upsert.map((x) => [x.id, x]));
    out = list.filter((x) => !removed.has(x.id)).map((x) => incoming.get(x.id) ?? x);
    const known = new Set(out.map((x) => x.id));
    out = [...upsert.filter((x) => !known.has(x.id)), ...out];
  }
  if (p.order) {
    const rank = new Map(p.order.map((id, i) => [id, i]));
    out = [...out].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  }
  return out;
}

// ---------- Identifiants : les anciens (« wallet-cash », « tx-1727… ») deviennent des UUID ----------
// À faire une fois, avant le premier envoi. Renvoie la correspondance ancien -> nouveau.
export function migrateIds(d: SyncData): { data: SyncData; map: Record<string, string> } {
  const map: Record<string, string> = {};
  const fix = (id: string) => (isUuid(id) ? id : (map[id] ??= uuid()));
  const re = (id?: string) => (id ? map[id] ?? id : id);
  const wallets = d.wallets.map((w) => ({
    ...w,
    id: fix(w.id),
    members: w.members?.map((m) => ({ ...m, id: fix(m.id) })),
  }));
  const budgets = d.budgets.map((b) => ({ ...b, id: fix(b.id) }));
  const transactions = d.transactions.map((t) => ({
    ...t,
    id: fix(t.id),
    walletId: re(t.walletId)!,
    counterpartWalletId: re(t.counterpartWalletId),
    memberId: re(t.memberId),
    transferId: t.transferId && !isUuid(t.transferId) ? fix(t.transferId) : t.transferId,
  }));
  return { data: { ...d, wallets, budgets, transactions }, map };
}

// Données « vides » : rien de plus que les portefeuilles de départ
export const isTrivial = (d: SyncData) => d.transactions.length === 0 && d.budgets.length === 0 && d.ristournes.length === 0 && d.wallets.length <= 2;

// ---------- Envoi ----------

interface TableSpec {
  name: TableName;
  rows: (d: SyncData, me: string) => Row[];
  key: (r: Row) => string;
}

// Mémoire d'une ligne : son empreinte, et pour une transaction « empreinte:portefeuille »
const stamp = (t: TableName, r: Row) =>
  t === 'transactions' ? `${fingerprint(r)}:${r.wallet_id}` : t === 'ristourne_payments' ? `${fingerprint(r)}:${r.ristourne_id}` : fingerprint(r);

const SPECS: TableSpec[] = [
  { name: 'profiles', rows: (d, me) => [profileRow(d, me)], key: (r) => String(r.id) },
  { name: 'categories', rows: (d, me) => d.categories.map((c, i) => categoryRow(c, i, me)), key: (r) => String(r.id) },
  { name: 'custom_icons', rows: (d, me) => d.customIcons.map((i) => iconRow(i, me)), key: (r) => String(r.id) },
  { name: 'wallets', rows: (d) => d.wallets.map(walletRow), key: (r) => String(r.id) },
  { name: 'wallet_members', rows: (d, me) => d.wallets.flatMap((w) => memberRows(w, me)), key: (r) => String(r.id) },
  { name: 'transactions', rows: (d) => d.transactions.map(transactionRow), key: (r) => String(r.id) },
  { name: 'budgets', rows: (d) => d.budgets.map(budgetRow), key: (r) => String(r.id) },
  // Ristournes : la ristourne et ses membres par le propriétaire, les paiements par tout membre
  { name: 'ristournes', rows: (d, me) => d.ristournes.filter((r) => !r.ownerId || r.ownerId === me).map(ristourneRow), key: (r) => String(r.id) },
  { name: 'ristourne_members', rows: (d, me) => d.ristournes.flatMap((r) => ristourneMemberRows(r, me)), key: (r) => String(r.id) },
  { name: 'ristourne_payments', rows: (d) => d.ristournes.flatMap((r) => r.payments.map((p) => paymentRow(r, p))), key: (r) => String(r.id) },
];

async function push(d: SyncData, meta: SyncMeta, remote: Remote): Promise<number> {
  let sent = 0;
  const me = remote.me;
  // Portefeuilles partagés quittés depuis la dernière synchro (calculé avant de toucher aux mémoires)
  const leaving = new Set(Object.keys(meta.snap.wallets ?? {}).filter((id) => meta.foreignWallets.includes(id) && !d.wallets.some((w) => w.id === id)));
  // Ristournes d'autrui quittées ici (elles ne sont jamais envoyées : on se retire, rien n'est supprimé)
  const leftRistournes = (meta.foreignRistournes ?? []).filter((id) => !d.ristournes.some((r) => r.id === id));
  for (const id of leftRistournes) await remote.leaveRistourne(id);
  for (const spec of SPECS) {
    const snap = { ...(meta.snap[spec.name] ?? {}) };
    const rows = spec.rows(d, me);
    const keys = new Set(rows.map(spec.key));
    const changed = rows.filter((r) => snap[spec.key(r)] !== stamp(spec.name, r));
    for (let i = 0; i < changed.length; i += 500) await remote.upsert(spec.name, changed.slice(i, i + 500));
    changed.forEach((r) => (snap[spec.key(r)] = stamp(spec.name, r)));
    sent += changed.length;

    // Supprimés ici depuis la dernière synchro.
    // Les opérations d'un portefeuille partagé qu'on QUITTE ne sont pas supprimées pour les autres.
    const scope = (k: string) => snap[k].split(':')[1];
    const gone = Object.keys(snap).filter(
      (k) =>
        !keys.has(k) &&
        !(spec.name === 'transactions' && leaving.has(scope(k))) &&
        !(spec.name === 'ristourne_payments' && leftRistournes.includes(scope(k)))
    );
    const forgotten = Object.keys(snap).filter((k) => !keys.has(k) && !gone.includes(k));
    if (gone.length && spec.name !== 'profiles' && spec.name !== 'wallet_members' && spec.name !== 'ristourne_members') {
      if (spec.name === 'wallets') {
        // Portefeuille d'un autre : on le quitte ; le mien : on le supprime
        for (const id of gone.filter((id) => meta.foreignWallets.includes(id))) await remote.leaveWallet(id);
        const mine = gone.filter((id) => !meta.foreignWallets.includes(id));
        for (let i = 0; i < mine.length; i += 100) await remote.softDelete('wallets', mine.slice(i, i + 100));
      } else {
        for (let i = 0; i < gone.length; i += 100) await remote.softDelete(spec.name, gone.slice(i, i + 100));
      }
      sent += gone.length;
    }
    [...gone, ...forgotten].forEach((k) => delete snap[k]);
    meta.snap[spec.name] = snap;
  }
  meta.foreignWallets = d.wallets.filter((w) => w.ownerId && w.ownerId !== me).map((w) => w.id);
  meta.foreignRistournes = d.ristournes.filter((r) => r.ownerId && r.ownerId !== me).map((r) => r.id);
  return sent;
}

// ---------- Réception ----------

// Petit recouvrement : une écriture validée juste avant la dernière lecture n'est pas manquée
const since = (cursor?: string) => (cursor ? new Date(new Date(cursor).getTime() - 2 * 60_000).toISOString() : null);
const maxDate = (rows: Row[], prev?: string) =>
  rows.reduce<string | undefined>((m, r) => (!m || String(r.updated_at) > m ? String(r.updated_at) : m), prev);

async function pull(d: SyncData, meta: SyncMeta, remote: Remote): Promise<{ patch: SyncPatch; count: number }> {
  const me = remote.me;
  const patch: SyncPatch = {};
  let count = 0;
  const fetch = async (t: TableName) => {
    const full = !meta.cursors[t];
    const rows = await remote.pull(t, since(meta.cursors[t]));
    meta.cursors[t] = maxDate(rows, meta.cursors[t]);
    count += rows.length;
    const snap = (meta.snap[t] ??= {});
    return { rows, full, snap };
  };
  const byOrder = (rows: Row[]) => [...rows].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((r) => String(r.id));

  // Profil -> réglages + nom
  {
    const { rows, snap } = await fetch('profiles');
    const r = rows.find((x) => x.id === me);
    if (r) {
      const settings = settingsFromRow(r);
      const profileName = String(r.name ?? '');
      const fp = fingerprint(profileRow({ ...d, settings, profileName }, me));
      if (snap[me] !== fp || fingerprint(profileRow(d, me)) !== fp) {
        patch.settings = settings;
        patch.profileName = profileName;
      }
      snap[me] = fp;
    }
  }

  // Catégories
  let categories = d.categories;
  {
    const { rows, full, snap } = await fetch('categories');
    if (rows.length) {
      const known = (c: Category) => {
        const i = d.categories.findIndex((x) => x.id === c.id);
        return i >= 0 && snap[c.id] === fingerprint(categoryRow(c, i, me)) && snap[c.id] === fingerprint(categoryRow(d.categories[i], i, me));
      };
      const live = rows.filter((r) => !r.deleted_at).map(categoryFromRow).filter((c) => full || !known(c));
      const remove = rows.filter((r) => r.deleted_at).map((r) => String(r.id));
      if (live.length || remove.length) patch.categories = { upsert: live, remove, order: full ? byOrder(rows.filter((r) => !r.deleted_at)) : undefined };
      if (patch.categories) categories = applyList(categories, patch.categories);
      categories.forEach((c, i) => {
        if (live.some((x) => x.id === c.id)) snap[c.id] = fingerprint(categoryRow(c, i, me));
      });
      remove.forEach((id) => delete snap[id]);
    }
  }

  // Icônes
  {
    const { rows, snap } = await fetch('custom_icons');
    if (rows.length) {
      const localI = new Map(d.customIcons.map((i) => [i.id, i]));
      const live = rows
        .filter((r) => !r.deleted_at)
        .map(iconFromRow)
        .filter((i) => !(localI.has(i.id) && fingerprint(iconRow(localI.get(i.id)!, me)) === fingerprint(iconRow(i, me))));
      const remove = rows.filter((r) => r.deleted_at && localI.has(String(r.id))).map((r) => String(r.id));
      if (live.length || remove.length) patch.customIcons = { upsert: live, remove };
      live.forEach((i) => (snap[i.id] = fingerprint(iconRow(i, me))));
      remove.forEach((id) => delete snap[id]);
    }
  }

  // Portefeuilles + membres
  let wallets = d.wallets;
  const touched = new Map<string, Wallet>();
  {
    const { rows, full, snap } = await fetch('wallets');
    const remove = rows.filter((r) => r.deleted_at).map((r) => String(r.id));
    for (const r of rows.filter((x) => !x.deleted_at)) {
      const w = walletFromRow(r, me, wallets.find((x) => x.id === r.id));
      touched.set(w.id, w);
    }
    const m = await fetch('wallet_members');
    const byWallet = new Map<string, Row[]>();
    m.rows.forEach((r) => byWallet.set(String(r.wallet_id), [...(byWallet.get(String(r.wallet_id)) ?? []), r]));
    for (const [wid, list] of byWallet) {
      const base = touched.get(wid) ?? wallets.find((x) => x.id === wid);
      if (base) touched.set(wid, mergeMembers(base, list, me));
    }

    // Portefeuilles partagés qu'on ne voit plus (retiré par le propriétaire) : on les oublie ici
    const visible = new Set(await remote.visibleWalletIds());
    const lost = wallets.filter((w) => snap[w.id] && !visible.has(w.id) && !remove.includes(w.id)).map((w) => w.id);
    remove.push(...lost);

    remove.forEach((id) => touched.delete(id));
    if (touched.size || remove.length) {
      patch.wallets = { upsert: [...touched.values()], remove, order: full ? byOrder(rows.filter((r) => !r.deleted_at)) : undefined };
      wallets = applyList(wallets, patch.wallets);
      wallets.forEach((w, i) => {
        if (touched.has(w.id)) {
          snap[w.id] = fingerprint(walletRow(w, i));
          const ms = (meta.snap.wallet_members ??= {});
          memberRows(w, me).forEach((r) => (ms[String(r.id)] = fingerprint(r)));
        }
      });
      remove.forEach((id) => delete snap[id]);
    }
    meta.foreignWallets = wallets.filter((w) => w.ownerId && w.ownerId !== me).map((w) => w.id);

    // Transactions des portefeuilles oubliés
    if (remove.length) {
      const gone = new Set(remove);
      const txs = d.transactions.filter((t) => gone.has(t.walletId)).map((t) => t.id);
      patch.transactions = { upsert: [], remove: txs };
      const ts = (meta.snap.transactions ??= {});
      txs.forEach((id) => delete ts[id]);
    }
  }

  // Transactions
  {
    const { rows, snap } = await fetch('transactions');
    if (rows.length) {
      const localById = new Map(d.transactions.map((t) => [t.id, t]));
      const live = rows
        .filter((r) => !r.deleted_at)
        .map((r) => transactionFromRow(r, me, wallets, categories))
        .filter((t) => {
          const mine = localById.get(t.id);
          const s = stamp('transactions', transactionRow(t));
          return !(mine && snap[t.id] === s && stamp('transactions', transactionRow(mine)) === s);
        });
      const remove = rows.filter((r) => r.deleted_at && localById.has(String(r.id))).map((r) => String(r.id));
      if (live.length || remove.length) patch.transactions = {
        upsert: live,
        remove: [...(patch.transactions?.remove ?? []), ...remove],
      };
      live.forEach((t) => (snap[t.id] = stamp('transactions', transactionRow(t))));
      remove.forEach((id) => delete snap[id]);
    }
  }

  // Budgets
  {
    const { rows, snap } = await fetch('budgets');
    if (rows.length) {
      const localB = new Map(d.budgets.map((b) => [b.id, b]));
      const live = rows
        .filter((r) => !r.deleted_at)
        .map(budgetFromRow)
        .filter((b) => !(localB.has(b.id) && fingerprint(budgetRow(localB.get(b.id)!)) === fingerprint(budgetRow(b))));
      const remove = rows.filter((r) => r.deleted_at && localB.has(String(r.id))).map((r) => String(r.id));
      if (live.length || remove.length) patch.budgets = { upsert: live, remove };
      live.forEach((b) => (snap[b.id] = fingerprint(budgetRow(b))));
      remove.forEach((id) => delete snap[id]);
    }
  }
  // Ristournes (+ membres et paiements, rangés dans chaque ristourne)
  {
    const rr = await fetch('ristournes');
    const mr = await fetch('ristourne_members');
    const pr = await fetch('ristourne_payments');
    const touched = new Map<string, Ristourne>();
    const base = (id: string) => touched.get(id) ?? d.ristournes.find((x) => x.id === id);
    const remove = rr.rows.filter((r) => r.deleted_at).map((r) => String(r.id));
    for (const row of rr.rows.filter((r) => !r.deleted_at)) touched.set(String(row.id), ristourneFromRow(row, me, base(String(row.id))));
    for (const row of mr.rows) {
      const r = base(String(row.ristourne_id));
      if (!r) continue;
      const old = r.members.find((m) => m.id === row.id);
      const m = ristourneMemberFromRow(row, me, old);
      touched.set(r.id, { ...r, members: old ? r.members.map((x) => (x.id === m.id ? m : x)) : [...r.members, m] });
    }
    for (const row of pr.rows) {
      const r = base(String(row.ristourne_id));
      if (!r) continue;
      const without = r.payments.filter((x) => x.id !== row.id);
      touched.set(r.id, { ...r, payments: row.deleted_at ? without : [...without, paymentFromRow(row)] });
    }
    // Ristournes qu'on ne voit plus (retiré, ou on l'a quittée ailleurs)
    const visible = new Set(await remote.visibleRistourneIds());
    remove.push(...d.ristournes.filter((r) => (rr.snap[r.id] !== undefined || r.ownerId) && !visible.has(r.id) && !remove.includes(r.id)).map((r) => r.id));
    remove.forEach((id) => touched.delete(id));

    // On ne réapplique pas ce qui n'a pas changé
    const same = (a: Ristourne, b?: Ristourne) => !!b && JSON.stringify(a) === JSON.stringify(b);
    const upsert = [...touched.values()].filter((r) => !same(r, d.ristournes.find((x) => x.id === r.id)));
    if (upsert.length || remove.length) patch.ristournes = { upsert, remove };
    for (const r of touched.values()) {
      if (!r.ownerId || r.ownerId === me) rr.snap[r.id] = fingerprint(ristourneRow(r));
      ristourneMemberRows(r, me).forEach((row) => (mr.snap[String(row.id)] = fingerprint(row)));
      r.payments.forEach((p) => (pr.snap[p.id] = stamp('ristourne_payments', paymentRow(r, p))));
    }
    for (const id of remove) {
      delete rr.snap[id];
      const r = d.ristournes.find((x) => x.id === id);
      r?.members.forEach((m) => delete mr.snap[m.id]);
      r?.payments.forEach((p) => delete pr.snap[p.id]);
    }
    pr.rows.filter((row) => row.deleted_at).forEach((row) => delete pr.snap[String(row.id)]);
    meta.foreignRistournes = applyList(d.ristournes, patch.ristournes)
      .filter((r) => r.ownerId && r.ownerId !== me)
      .map((r) => r.id);
  }
  return { patch, count };
}

// ---------- Modifications faites PENDANT la synchro ----------
// La réception part des données lues au début (`before`). Si, entre-temps, un élément a été
// modifié, ajouté ou supprimé ici (`now`), la version reçue est plus ancienne : on ne l'applique
// pas (sinon un portefeuille archivé ou supprimé « revient »), et on marque l'élément pour qu'il
// soit renvoyé au prochain tour. Renvoie true s'il faut refaire une synchro.
const LISTS = [
  ['wallets', 'wallets'],
  ['transactions', 'transactions'],
  ['categories', 'categories'],
  ['budgets', 'budgets'],
  ['ristournes', 'ristournes'],
  ['customIcons', 'custom_icons'],
] as const;

export function keepLocalEdits(patch: SyncPatch, meta: SyncMeta, before: SyncData, now: SyncData): boolean {
  if (patch.replaceAll || before === now) return false;
  let dirtyAny = false;
  for (const [key, table] of LISTS) {
    const prev = new Map<string, unknown>(before[key].map((x) => [x.id, x]));
    const cur = new Map<string, { id: string; walletId?: string }>(now[key].map((x) => [x.id, x]));
    const dirty = new Set<string>();
    for (const [id, x] of cur) if (prev.get(id) !== x) dirty.add(id); // modifié ou ajouté
    for (const id of prev.keys()) if (!cur.has(id)) dirty.add(id); // supprimé
    if (!dirty.size) continue;
    dirtyAny = true;
    const lp = patch[key] as ListPatch<{ id: string }> | undefined;
    if (lp) (patch[key] as ListPatch<{ id: string }>) = { ...lp, upsert: lp.upsert.filter((x) => !dirty.has(x.id)) };
    // Modifié ici : empreinte invalide -> renvoyé. Supprimé ici : l'empreinte reste -> suppression envoyée.
    const snap = (meta.snap[table] ??= {});
    for (const id of dirty) {
      const x = cur.get(id);
      if (x) snap[id] = table === 'transactions' ? `dirty:${x.walletId}` : 'dirty';
    }
  }
  return dirtyAny;
}

// ---------- Une synchro complète ----------
// getLocal() est rappelé au moment de l'envoi pour prendre les données les plus récentes.
export async function runSync(
  getLocal: () => SyncData,
  metaIn: SyncMeta | null,
  remote: Remote,
  decision?: 'merge' | 'replace'
): Promise<SyncResult> {
  const me = remote.me;
  let meta: SyncMeta = metaIn && metaIn.userId === me ? structuredClone(metaIn) : emptyMeta(me);
  const first = !metaIn || metaIn.userId !== me;

  // Invitations reçues : les nouveaux portefeuilles partagés sont récupérés en entier
  if ((await remote.acceptInvites()) > 0) {
    delete meta.cursors.wallets;
    delete meta.cursors.wallet_members;
    delete meta.cursors.transactions;
    delete meta.cursors.ristournes;
    delete meta.cursors.ristourne_members;
    delete meta.cursors.ristourne_payments;
  }

  let replace = false;
  if (first) {
    const remoteWallets = (await remote.visibleWalletIds()).length;
    const local = getLocal();
    if (remoteWallets > 0 && !isTrivial(local)) {
      if (!decision) return { status: 'needs-decision', remoteWallets };
      replace = decision === 'replace';
    } else replace = remoteWallets > 0; // téléphone vide, compte déjà rempli : on prend le compte
  }

  if (replace) {
    // On repart des données du compte : rien n'est envoyé, tout est reçu
    meta = emptyMeta(me);
    const empty: SyncData = { ...getLocal(), wallets: [], transactions: [], budgets: [], customIcons: [], ristournes: [] };
    const { patch, count } = await pull(empty, meta, remote);
    patch.replaceAll = true;
    return { status: 'done', patch, meta, pushed: 0, pulled: count };
  }

  const pushed = await push(getLocal(), meta, remote);
  const { patch, count } = await pull(getLocal(), meta, remote);
  return { status: 'done', patch, meta, pushed, pulled: count };
}
