// Test de bout en bout de la synchro, sur un PostgreSQL local avec le vrai schéma et les vraies règles
// d'accès (comptes simulés). Lancer : npx tsx scripts/sync.test.ts
// Prérequis : base « wallo_test » créée avec supabase/tests/local_auth_stub.sql + la migration.
import pg from 'pg';
import readXlsxFile from 'read-excel-file/node';
import { parseCheck } from '../src/lib/sync/supabaseRemote';
import { runSync, applyList, migrateIds, keepLocalEdits, idsOf, Remote, SyncMeta, SyncPatch } from '../src/lib/sync/engine';
import { Row, SyncData, TableName } from '../src/lib/sync/mapping';
import { fromSheets, planImport } from '../src/lib/importExport';
import { DEFAULT_CATEGORIES } from '../src/data/categories';
import { uuid } from '../src/lib/ids';

pg.types.setTypeParser(1700, parseFloat); // numeric -> nombre (comme PostgREST)
pg.types.setTypeParser(1082, (v) => v); // date -> 'AAAA-MM-JJ'
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz -> ISO

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:wallo-test@127.0.0.1:5432/wallo_test' });

const KEYS: Record<TableName, string> = {
  profiles: 'id',
  categories: 'user_id, id',
  custom_icons: 'user_id, id',
  wallets: 'id',
  wallet_members: 'id',
  transactions: 'id',
  budgets: 'id',
  ristournes: 'id',
  ristourne_members: 'id',
  ristourne_payments: 'id',
  debt_shares: 'id',
  debt_moves: 'id',
  recurrings: 'id',
};

// Imite supabase-js / PostgREST : chaque requête avec le jeton de l'utilisateur, soumise aux règles
function pgRemote(me: string, email: string): Remote {
  const as = async <T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> => {
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: me, email })]);
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  };
  return {
    me,
    acceptInvites: () => as(async (c) => (await c.query('select accept_invites() as n')).rows[0].n),
    pull: (t, since) =>
      as(async (c) => (await c.query(`select * from public.${t} where ($1::timestamptz is null or updated_at > $1) order by updated_at, 2`, [since])).rows),
    upsert: (t, rows) =>
      as(async (c) => {
        const cols = Object.keys(rows[0]);
        const keys = KEYS[t].split(',').map((k) => k.trim());
        const set = cols.filter((k) => !keys.includes(k)).map((k) => `${k} = excluded.${k}`);
        await c.query(
          `insert into public.${t} (${cols.join(',')}) select ${cols.join(',')} from json_populate_recordset(null::public.${t}, $1)
           on conflict (${KEYS[t]}) do update set ${set.join(', ')}`,
          [JSON.stringify(rows)]
        );
      }),
    softDelete: (t, ids) => as(async (c) => void (await c.query(`update public.${t} set deleted_at = now() where id::text = any($1)`, [ids]))),
    leaveWallet: (id) => as(async (c) => void (await c.query('select leave_wallet($1)', [id]))),
    visibleWalletIds: () => as(async (c) => (await c.query('select id from public.wallets where deleted_at is null')).rows.map((r) => r.id)),
    leaveRistourne: (id) => as(async (c) => void (await c.query('select leave_ristourne($1)', [id]))),
    visibleRistourneIds: () => as(async (c) => (await c.query('select id from public.ristournes where deleted_at is null')).rows.map((r) => r.id)),
    leaveDebtShare: (id) => as(async (c) => void (await c.query('select leave_debt_share($1)', [id]))),
    visibleDebtShareIds: () => as(async (c) => (await c.query('select id from public.debt_shares where deleted_at is null')).rows.map((r) => r.id)),
    // Comme l'app : coup d'œil sync_check (SYNC_CHECK=0 pour tester sans)
    ...(process.env.SYNC_CHECK === '0'
      ? {}
      : { check: (since: object) => as(async (c) => parseCheck((await c.query('select sync_check($1) as r', [JSON.stringify(since)])).rows[0].r)) }),
  };
}

// Appel d'une fonction de la base en tant que … (comme sb.rpc dans l'app)
async function rpcAs(me: string, email: string, sql: string, params: unknown[]): Promise<string> {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: me, email })]);
    const v = (await c.query(sql, params)).rows[0].v;
    await c.query('commit');
    return v;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

// Un « téléphone » : ses données locales + sa mémoire de synchro, et la même logique que l'app
class Device {
  meta: SyncMeta | null = null;
  known = new Set<string>(); // comme useCloud : ce que cet appareil / onglet a eu dans ses données
  constructor(public name: string, public data: SyncData, public remote: Remote) {}
  apply(p: SyncPatch) {
    const r = !!p.replaceAll;
    this.data = {
      ...this.data,
      wallets: applyList(this.data.wallets, p.wallets, r),
      transactions: applyList(this.data.transactions, p.transactions, r),
      categories: p.categories ? applyList(this.data.categories, p.categories, r) : this.data.categories,
      budgets: applyList(this.data.budgets, p.budgets, r),
      recurrings: applyList(this.data.recurrings, p.recurrings, r),
      customIcons: applyList(this.data.customIcons, p.customIcons, r),
      ristournes: applyList(this.data.ristournes, p.ristournes, r),
      debtShares: applyList(this.data.debtShares, p.debtShares, r),
      settings: p.settings ?? this.data.settings,
      profileName: p.profileName ?? this.data.profileName,
    };
  }
  async sync(decision?: 'merge' | 'replace', refetchShared = false) {
    const { data } = migrateIds(this.data);
    this.data = data;
    idsOf(this.data).forEach((id) => this.known.add(id));
    let seen: SyncData | undefined;
    const res = await runSync(() => (seen = this.data), this.meta, this.remote, decision, refetchShared, this.known);
    if (res.status === 'needs-decision') return res;
    const again = !!seen && keepLocalEdits(res.patch, res.meta, seen, this.data); // comme useCloud
    this.apply(res.patch);
    idsOf(this.data).forEach((id) => this.known.add(id));
    this.meta = res.meta;
    return { ...res, again };
  }
}

// Premier portefeuille ordinaire d'un appareil
const cash0 = (d: Device) => d.data.wallets.find((w) => (w.kind ?? 'basic') === 'basic')!;

const fresh = (): SyncData => ({
  wallets: [
    { id: 'wallet-cash', name: 'Cash', icon: 'Banknote', color: '#059669', currency: 'USD', initialBalance: 0, includeInTotal: true, archived: false },
    { id: 'wallet-momo', name: 'Mobile Money', icon: 'Smartphone', color: '#F97316', currency: 'USD', initialBalance: 0, includeInTotal: true, archived: false },
  ],
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  budgets: [],
  recurrings: [],
  settings: { mainCurrency: 'USD', secondCurrency: null, rates: {} },
  profileName: '',
  customIcons: [],
  ristournes: [],
  debtShares: [],
});

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} : ${what}`);
  if (!ok) failures++;
};
const count = async (sql: string) => Number((await db.query(sql)).rows[0].n);
const balance = (d: SyncData, name: string) => {
  const w = d.wallets.find((x) => x.name === name)!;
  return Math.round(d.transactions.filter((t) => t.walletId === w.id).reduce((s, t) => s + t.amount, w.initialBalance) * 100) / 100;
};

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

async function main() {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'alice@test.cd', '{"full_name":"Alice"}'), ($2, 'bob@test.cd', '{}')`, [ALICE, BOB]);

  // 1. Alice importe son fichier Money Lover sur son téléphone, puis se connecte
  // Export Money Lover de référence (10 portefeuilles, 2435 opérations) : MONEYLOVER_XLSX=chemin/du/fichier.xlsx
  const sheets = await readXlsxFile(
    process.env.MONEYLOVER_XLSX ?? '/root/.claude/uploads/ce1f3682-f578-5503-b1a3-8a25c9832c47/c85c2d6b-MoneyLover_TotalWallet_TousCategory_01_01_2025-29_09_2026.xlsx'
  );
  const base = fresh();
  const plan = planImport(fromSheets(sheets as never), { ...base, transactions: [] }, false);
  const a1 = new Device('Alice-téléphone', {
    ...base,
    wallets: [...base.wallets, ...plan.newWallets],
    categories: [...base.categories, ...plan.newCategories],
    transactions: plan.transactions,
    settings: { mainCurrency: 'CDF', secondCurrency: 'USD', rates: { USD: 2289 } },
    profileName: 'Alice',
  }, pgRemote(ALICE, 'alice@test.cd'));
  let t = Date.now();
  const r1 = await a1.sync();
  check(r1.status === 'done', `1re synchro d'Alice (${Date.now() - t} ms)`);
  check(a1.data.wallets.every((w) => /^[0-9a-f-]{36}$/.test(w.id)), 'les anciens identifiants (« wallet-cash ») sont devenus des UUID');
  check((await count('select count(*) n from wallets')) === 10, '10 portefeuilles dans la base');
  check((await count('select count(*) n from transactions')) === 2435, '2435 transactions dans la base');
  check((await count(`select count(*) n from categories where user_id = '${ALICE}'`)) === a1.data.categories.length, 'catégories envoyées (sous-catégories comprises)');

  // 2. Resynchro sans rien changer : rien à renvoyer (les empreintes sont stables aller-retour)
  const r2 = await a1.sync();
  check(r2.status === 'done' && r2.pushed === 0, `2e synchro : rien renvoyé (${r2.status === 'done' ? r2.pushed : '?'} envoyés)`);
  check(r2.status === 'done' && !r2.patch.transactions && !r2.patch.categories && !r2.patch.settings, '2e synchro : rien à réappliquer sur le téléphone (pas de boucle)');

  // 3. Alice installe l'app sur un 2e appareil (vide) : elle récupère tout
  const a2 = new Device('Alice-ordinateur', fresh(), pgRemote(ALICE, 'alice@test.cd'));
  const r3 = await a2.sync();
  check(r3.status === 'done' && a2.data.transactions.length === 2435, `2e appareil : 2435 transactions récupérées`);
  check(a2.data.wallets.length === 10 && a2.data.wallets.map((w) => w.name).join() === a1.data.wallets.map((w) => w.name).join(), '2e appareil : mêmes portefeuilles, même ordre');
  check(['Franc Congolais Cash', 'Orange 2 ($)'].every((n) => balance(a1.data, n) === balance(a2.data, n)), '2e appareil : mêmes soldes');
  check(a2.data.settings.mainCurrency === 'CDF' && a2.data.profileName === 'Alice', '2e appareil : réglages et nom récupérés');
  check(a2.data.categories.find((c) => c.name === 'Apple Music')?.parentId === a1.data.categories.find((c) => c.name === 'Apple Music')?.parentId, '2e appareil : sous-catégories rangées pareil');
  const r3b = await a2.sync();
  check(r3b.status === 'done' && r3b.pushed === 0, '2e appareil : resynchro sans rien renvoyer');

  // 4. Modifications sur le 2e appareil -> visibles sur le 1er
  const victim = a2.data.transactions[0];
  const deleted = a2.data.transactions[1];
  a2.data = {
    ...a2.data,
    transactions: a2.data.transactions.filter((x) => x.id !== deleted.id).map((x) => (x.id === victim.id ? { ...x, title: 'Titre modifié' } : x)),
    budgets: [
      { id: uuid(), categoryId: 'food', amount: 150000, currency: 'CDF', createdAt: new Date().toISOString() },
      { id: uuid(), categoryId: 'transport', amount: 20000, currency: 'CDF', createdAt: new Date().toISOString(), period: 'custom', from: '2026-10-01', to: '2026-10-15' },
    ],
  };
  const r4 = await a2.sync();
  check(r4.status === 'done' && r4.pushed === 4, `2e appareil envoie 4 changements (${r4.status === 'done' ? r4.pushed : '?'})`);
  await a1.sync();
  check(a1.data.transactions.find((x) => x.id === victim.id)?.title === 'Titre modifié', '1er appareil : titre modifié reçu');
  check(!a1.data.transactions.some((x) => x.id === deleted.id), '1er appareil : suppression reçue');
  check(a1.data.budgets.length === 2 && a1.data.budgets.some((b) => b.period === 'custom' && b.from === '2026-10-01' && b.to === '2026-10-15'), '1er appareil : budgets reçus (dont un personnalisé, avec ses dates)');
  const r4b = await a1.sync();
  check(r4b.status === 'done' && r4b.pushed === 0, '1er appareil : rien à renvoyer après réception');

  // 4 bis. Objectif : « Pourquoi », rappel de la semaine et arrondis passent d'un appareil à l'autre
  const goalId = uuid();
  a1.data = {
    ...a1.data,
    wallets: [
      ...a1.data.wallets,
      {
        id: goalId, name: 'Moto', icon: 'Bike', color: '#6366F1', currency: 'USD', initialBalance: 0, includeInTotal: false, archived: false,
        kind: 'goal', goalAmount: 1200, goalDate: '2027-03-31', goalWhy: 'Aller au travail sans taxi-moto', goalReminder: { day: 5, amount: 10 }, roundUp: true,
      },
    ],
  };
  await a1.sync();
  await a2.sync();
  const g2 = a2.data.wallets.find((w) => w.id === goalId);
  check(g2?.goalWhy === 'Aller au travail sans taxi-moto' && g2.goalReminder?.day === 5 && g2.goalReminder.amount === 10 && g2.roundUp === true, 'objectif : pourquoi, rappel et arrondis reçus sur le 2e appareil');
  // Retirer le rappel et les arrondis sur le 2e appareil -> retirés sur le 1er
  a2.data = { ...a2.data, wallets: a2.data.wallets.map((w) => (w.id === goalId ? { ...w, goalReminder: null, roundUp: false } : w)) };
  await a2.sync();
  await a1.sync();
  const g1 = a1.data.wallets.find((w) => w.id === goalId);
  check(!g1?.goalReminder && !g1?.roundUp && g1?.goalWhy === 'Aller au travail sans taxi-moto', 'objectif : rappel et arrondis retirés, pourquoi gardé');
  const r4c = await a1.sync();
  const r4d = await a2.sync();
  check(r4c.status === 'done' && r4d.status === 'done' && r4c.pushed + r4d.pushed <= 1, 'objectif : la synchro se stabilise (pas de boucle)');

  // 4 ter. Opérations qui reviennent / factures et défi d'épargne
  const recId = uuid();
  a1.data = {
    ...a1.data,
    recurrings: [
      { id: recId, title: 'SNEL', currency: 'USD', walletId: cash0(a1).id, direction: 'out', categoryId: 'bills-power', frequency: 'month', nextDate: '2026-11-08', mode: 'ask', bill: true, remindDays: 3, active: true, createdAt: new Date().toISOString() },
    ],
    wallets: a1.data.wallets.map((w) => (w.id === goalId ? { ...w, challenge: { type: '52w', start: '2026-10-06', base: 1 } } : w)),
  };
  await a1.sync();
  await a2.sync();
  const rec2 = a2.data.recurrings.find((r) => r.id === recId);
  check(rec2?.title === 'SNEL' && rec2.amount === undefined && rec2.bill === true && rec2.nextDate === '2026-11-08', 'facture SNEL (montant variable) reçue sur le 2e appareil');
  check(a2.data.wallets.find((w) => w.id === goalId)?.challenge?.type === '52w', 'défi 52 semaines reçu sur le 2e appareil');
  // Payée sur le 2e appareil : la date avance, reçue sur le 1er
  a2.data = { ...a2.data, recurrings: a2.data.recurrings.map((r) => (r.id === recId ? { ...r, nextDate: '2026-12-08', amount: 42 } : r)) };
  await a2.sync();
  await a1.sync();
  check(a1.data.recurrings.find((r) => r.id === recId)?.nextDate === '2026-12-08', 'facture payée sur le 2e appareil : prochaine date reçue sur le 1er');
  a1.data = { ...a1.data, recurrings: a1.data.recurrings.filter((r) => r.id !== recId) };
  await a1.sync();
  await a2.sync();
  check(!a2.data.recurrings.some((r) => r.id === recId), 'facture supprimée : retirée du 2e appareil');
  const r4e = await a1.sync();
  check(r4e.status === 'done' && r4e.pushed === 0, 'opérations qui reviennent : rien à renvoyer ensuite');

  // 5. Hors ligne : Alice ajoute deux dépenses sans réseau, puis la synchro reprend
  const cash = a1.data.wallets.find((w) => w.name === 'Dollars Américain Cash')!;
  const off = (title: string) => ({ ...a1.data.transactions[0], id: uuid(), walletId: cash.id, title, amount: -3, currency: 'USD', transferId: undefined, counterpartWalletId: undefined, memberId: undefined });
  a1.data = { ...a1.data, transactions: [off('Hors ligne 1'), off('Hors ligne 2'), ...a1.data.transactions] };
  const r5 = await a1.sync();
  check(r5.status === 'done' && r5.pushed === 2, 'ajouts faits hors ligne envoyés au retour du réseau');

  // 6. Partage : Alice invite Bob sur « Dollars Américain Cash »
  const bobMember = { id: uuid(), name: 'Bob', color: '#3B82F6', contact: 'bob@test.cd' };
  a1.data = { ...a1.data, wallets: a1.data.wallets.map((w) => (w.id === cash.id ? { ...w, members: [bobMember] } : w)) };
  await a1.sync();
  check((await count(`select count(*) n from wallet_members where status = 'invited' and email = 'bob@test.cd'`)) === 1, 'invitation de Bob enregistrée');

  const b1 = new Device('Bob-téléphone', fresh(), pgRemote(BOB, 'bob@test.cd'));
  const r6 = await b1.sync();
  check(r6.status === 'done', 'Bob se connecte (invitation acceptée automatiquement)');
  check(b1.data.wallets.length === 1 && b1.data.wallets[0].id === cash.id, 'Bob voit seulement le portefeuille partagé');
  const cashTx = a1.data.transactions.filter((x) => x.walletId === cash.id).length;
  check(b1.data.transactions.length === cashTx, `Bob reçoit ses ${cashTx} transactions, pas celles des autres portefeuilles`);
  check(b1.data.wallets[0].ownerId === ALICE && !!b1.data.wallets[0].myMemberId, 'chez Bob : Alice est propriétaire, Bob a sa ligne de membre');
  check(b1.data.categories.length === DEFAULT_CATEGORIES.length, 'Bob garde ses propres catégories (pas celles d\'Alice)');

  // 7. Bob ajoute une dépense dans le partagé -> Alice la voit « faite par Bob »
  const bobTx = { ...b1.data.transactions[0], id: uuid(), title: 'Courses Bob', amount: -12, memberId: undefined, transferId: undefined, counterpartWalletId: undefined };
  b1.data = { ...b1.data, transactions: [bobTx, ...b1.data.transactions] };
  await b1.sync();
  await a1.sync();
  const seen = a1.data.transactions.find((x) => x.id === bobTx.id);
  const bobRow = a1.data.wallets.find((w) => w.id === cash.id)?.members?.find((m) => m.userId === BOB);
  check(!!seen && !!bobRow && seen.memberId === bobRow.id, 'Alice voit « Courses Bob », faite par Bob');
  check(balance(a1.data, 'Dollars Américain Cash') === balance(b1.data, 'Dollars Américain Cash'), 'même solde du partagé chez Alice et chez Bob');
  const r7 = await b1.sync();
  check(r7.status === 'done' && r7.pushed === 0, 'Bob : rien à renvoyer');

  // 7b. Ristourne partagée : Alice crée, Bob la voit et note son paiement, Alice note celui de Papa
  const rid = uuid();
  const [mAlice, mBob, mPapa] = [uuid(), uuid(), uuid()];
  a1.data = {
    ...a1.data,
    ristournes: [{
      id: rid, name: 'Ristourne des amis', contribution: 20, currency: 'USD', frequency: 'weekly', startDate: '2026-09-29', payments: [],
      members: [
        { id: mAlice, name: 'Alice', turn: 1, isMe: true },
        { id: mBob, name: 'Bob', turn: 2, contact: 'bob@test.cd' },
        { id: mPapa, name: 'Papa', turn: 3 },
      ],
    }],
  };
  await a1.sync();
  await b1.sync();
  const rb = b1.data.ristournes.find((r) => r.id === rid);
  check(!!rb && rb.ownerId === ALICE && rb.members.find((m) => m.id === mBob)?.isMe === true, 'Bob voit la ristourne d\'Alice, et s\'y reconnaît');
  const rb2 = await b1.sync();
  check(rb2.status === 'done' && rb2.pushed === 0 && b1.data.ristournes.length === 1, 'Bob : resynchro sans rien renvoyer ni quitter la ristourne');
  b1.data = { ...b1.data, ristournes: b1.data.ristournes.map((r) => ({ ...r, payments: [...r.payments, { id: uuid(), memberId: mBob, turn: 1, amount: 20, paidAt: new Date().toISOString() }] })) };
  await b1.sync();
  a1.data = { ...a1.data, ristournes: a1.data.ristournes.map((r) => ({ ...r, payments: [...r.payments, { id: uuid(), memberId: mPapa, turn: 1, amount: 20, paidAt: new Date().toISOString() }] })) };
  await a1.sync();
  await b1.sync();
  check(a1.data.ristournes[0].payments.length === 2 && b1.data.ristournes[0].payments.length === 2, 'paiements de Bob et de Papa visibles des deux côtés');
  const ra = await a1.sync();
  check(ra.status === 'done' && ra.pushed === 0, 'Alice : rien à renvoyer');
  // Bob quitte la ristourne : ses paiements restent pour Alice
  b1.data = { ...b1.data, ristournes: [] };
  await b1.sync();
  check((await count(`select count(*) n from ristourne_payments where deleted_at is null`)) === 2, 'Bob quitte la ristourne : aucun paiement supprimé');
  await a1.sync();
  check(a1.data.ristournes[0].members.find((m) => m.id === mBob)?.removed === true, 'Alice voit que Bob a quitté la ristourne');
  const rq = await b1.sync();
  check(rq.status === 'done' && b1.data.ristournes.length === 0, 'la ristourne ne revient pas chez Bob');

  // 7c. Dette partagée : Alice prête 100 $ à Bob, Bob accepte le lien, rembourse 30 $, Alice confirme
  const sid = uuid();
  const [dm1, dm2] = [uuid(), uuid()];
  a1.data = {
    ...a1.data,
    debtShares: [{
      id: sid, side: 'receivable', person: 'Bob', status: 'open',
      moves: [{ id: dm1, kind: 'more', amount: 100, currency: 'USD', date: new Date().toISOString(), pending: true, recordedBy: ALICE, txId: 'tx-alice-pret' }],
    }],
  };
  await a1.sync();
  const dcode = await rpcAs(ALICE, 'alice@test.cd', `select create_debt_invite($1) ->> 'code' as v`, [sid]);
  const djoin = await rpcAs(BOB, 'bob@test.cd', `select join_debt($1, 'Alice') ->> 'status' as v`, [dcode]);
  check(djoin === 'joined', 'Bob accepte la dette partagée');
  await b1.sync(undefined, true); // comme useCloud juste après join_debt
  const db1 = b1.data.debtShares.find((x) => x.id === sid);
  check(
    !!db1 && db1.side === 'payable' && db1.person === 'Alice' && db1.ownerId === ALICE && db1.status === 'active' && db1.moves.length === 1 && !db1.moves[0].pending && !db1.moves[0].txId,
    'Bob voit « je dois 100 $ à Alice », confirmé, sans l\'opération d\'Alice'
  );
  await a1.sync();
  const da1 = a1.data.debtShares.find((x) => x.id === sid);
  check(da1?.status === 'active' && da1.moves[0].pending === false && da1.moves[0].txId === 'tx-alice-pret', 'Alice voit la dette acceptée, et garde son opération liée');

  b1.data = {
    ...b1.data,
    debtShares: b1.data.debtShares.map((x) =>
      x.id === sid ? { ...x, moves: [...x.moves, { id: dm2, kind: 'repay', amount: 30, currency: 'USD', date: new Date().toISOString(), pending: true, recordedBy: BOB, txId: 'tx-bob-airtel' }] } : x
    ),
  };
  await b1.sync();
  await a1.sync();
  const got = a1.data.debtShares.find((x) => x.id === sid)?.moves.find((m) => m.id === dm2);
  check(!!got && got.pending && got.recordedBy === BOB && !got.txId, 'Alice voit le remboursement de Bob, à confirmer');
  a1.data = {
    ...a1.data,
    debtShares: a1.data.debtShares.map((x) => (x.id === sid ? { ...x, moves: x.moves.map((m) => (m.id === dm2 ? { ...m, pending: false, txId: 'tx-alice-cash' } : m)) } : x)),
  };
  await a1.sync();
  await b1.sync();
  const conf = b1.data.debtShares.find((x) => x.id === sid)?.moves.find((m) => m.id === dm2);
  check(!!conf && !conf.pending && conf.txId === 'tx-bob-airtel', 'Bob voit la confirmation, et garde son opération Airtel liée');
  const dq1 = await a1.sync();
  const dq2 = await b1.sync();
  check(dq1.status === 'done' && dq1.pushed === 0 && dq2.status === 'done' && dq2.pushed === 0, 'dette partagée : ensuite rien à renvoyer');

  // Intérêts : Alice ajoute 10 $ d'intérêts, Bob les voit à confirmer ; les intérêts d'un prêt normal arrivent dans la base
  const dmi = uuid();
  a1.data = {
    ...a1.data,
    debtShares: a1.data.debtShares.map((x) =>
      x.id === sid ? { ...x, moves: [...x.moves, { id: dmi, kind: 'interest', amount: 10, currency: 'USD', date: new Date().toISOString(), note: 'Intérêts', pending: true, recordedBy: ALICE }] } : x
    ),
  };
  const loanTx = a1.data.transactions.find((t) => !t.transferId && t.walletId === cash.id)!;
  a1.data = { ...a1.data, transactions: a1.data.transactions.map((t) => (t.id === loanTx.id ? { ...t, interest: 12.5 } : t)) };
  await a1.sync();
  await b1.sync();
  const bi = b1.data.debtShares.find((x) => x.id === sid)?.moves.find((m) => m.id === dmi);
  check(bi?.kind === 'interest' && bi.pending === true, 'Bob voit les intérêts ajoutés par Alice, à confirmer');
  check((await count(`select count(*) n from transactions where id = '${loanTx.id}' and interest = 12.5`)) === 1, 'les intérêts d\'une opération sont envoyés');
  const di = await a1.sync();
  check(di.status === 'done' && di.pushed === 0, 'intérêts : ensuite rien à renvoyer');

  // Bob efface seul un mouvement confirmé : refusé par la base, il revient chez lui
  b1.data = { ...b1.data, debtShares: b1.data.debtShares.map((x) => (x.id === sid ? { ...x, moves: x.moves.filter((m) => m.id !== dm1) } : x)) };
  await b1.sync();
  check((await count(`select count(*) n from debt_moves where id = '${dm1}' and deleted_at is null`)) === 1, 'un mouvement confirmé effacé par un seul n\'est pas supprimé');
  await b1.sync();
  check(b1.data.debtShares.find((x) => x.id === sid)?.moves.some((m) => m.id === dm1) === true, 'et il revient chez Bob');

  // Bob arrête de suivre la dette : elle reste entière chez Alice
  b1.data = { ...b1.data, debtShares: [] };
  await b1.sync();
  await a1.sync();
  const dleft = a1.data.debtShares.find((x) => x.id === sid);
  check(dleft?.otherLeft === true && dleft.moves.length === 3, 'Bob ne suit plus : Alice garde la dette et ses 3 mouvements (intérêts compris)');
  await b1.sync();
  check(b1.data.debtShares.length === 0, 'la dette ne revient pas chez Bob');

  // 8. Première connexion sur un téléphone qui a déjà des données -> on demande
  const b2 = new Device('Bob-tablette', { ...fresh(), transactions: [{ ...bobTx, id: uuid(), walletId: 'wallet-cash' }] }, pgRemote(BOB, 'bob@test.cd'));
  const r8 = await b2.sync();
  check(r8.status === 'needs-decision', 'téléphone déjà rempli + compte rempli : on demande fusionner / remplacer');

  // 8b. Bob quitte le portefeuille de lui-même -> ses opérations restent chez Alice
  const before = await count(`select count(*) n from transactions where wallet_id = '${cash.id}' and deleted_at is null`);
  const bobCopy = b1.data;
  b1.data = { ...b1.data, wallets: [], transactions: [] };
  await b1.sync();
  check((await count(`select count(*) n from transactions where wallet_id = '${cash.id}' and deleted_at is null`)) === before, 'Bob quitte : aucune opération supprimée pour Alice');
  check((await count(`select count(*) n from wallet_members where user_id = '${BOB}' and status = 'removed'`)) === 1, 'Bob quitte : il n\'est plus membre');
  // Alice le réinvite pour la suite du test
  await db.query(`update wallet_members set status = 'active' where user_id = '${BOB}'`);
  b1.data = bobCopy;
  await b1.sync();

  // 9. Alice retire Bob -> le portefeuille disparaît de chez Bob
  a1.data = { ...a1.data, wallets: a1.data.wallets.map((w) => (w.id === cash.id ? { ...w, members: w.members!.map((m) => ({ ...m, removed: true })) } : w)) };
  await a1.sync();
  await b1.sync();
  check(b1.data.wallets.length === 0 && b1.data.transactions.length === 0, 'Bob retiré : portefeuille et transactions retirés de son téléphone');

  // 10. Alice supprime un portefeuille -> supprimé sur son 2e appareil
  const orange = a1.data.wallets.find((w) => w.name === 'Orange 1($)')!;
  a1.data = { ...a1.data, wallets: a1.data.wallets.filter((w) => w.id !== orange.id), transactions: a1.data.transactions.filter((x) => x.walletId !== orange.id) };
  await a1.sync();
  await a2.sync();
  check(!a2.data.wallets.some((w) => w.id === orange.id) && !a2.data.transactions.some((x) => x.walletId === orange.id), 'portefeuille supprimé sur les autres appareils, avec ses transactions');

  // 11. Archiver / supprimer PENDANT une synchro en cours : rien ne « revient »
  a1.data = { ...a1.data, wallets: a1.data.wallets.map((w) => ({ ...w, name: w.name })) }; // tout est « récent » côté base
  await a1.sync();
  const [toArchive, toDelete] = a1.data.wallets.filter((w) => !w.ownerId || w.ownerId === ALICE).slice(0, 2);
  const realPull = a1.remote.pull;
  let touchedOnce = false;
  a1.remote = {
    ...a1.remote,
    pull: async (t, since) => {
      const rows = await realPull(t, since);
      if (t === 'wallets' && !touchedOnce) {
        touchedOnce = true; // l'utilisateur agit pendant que la réponse arrive
        a1.data = {
          ...a1.data,
          wallets: a1.data.wallets.filter((w) => w.id !== toDelete.id).map((w) => (w.id === toArchive.id ? { ...w, archived: true } : w)),
          transactions: a1.data.transactions.filter((x) => x.walletId !== toDelete.id),
        };
      }
      return rows;
    },
  };
  await db.query(`update public.wallets set name = name where id = any($1)`, [[toArchive.id, toDelete.id]]); // lignes renvoyées par la base
  const r11 = await a1.sync();
  check(a1.data.wallets.find((w) => w.id === toArchive.id)?.archived === true, 'portefeuille archivé pendant la synchro : reste archivé');
  check(!a1.data.wallets.some((w) => w.id === toDelete.id), 'portefeuille supprimé pendant la synchro : ne revient pas');
  check(r11.status === 'done' && (r11 as { again?: boolean }).again === true, 'une nouvelle synchro est demandée');
  a1.remote = { ...a1.remote, pull: realPull };
  await a1.sync();
  await a1.sync();
  check(a1.data.wallets.find((w) => w.id === toArchive.id)?.archived === true && !a1.data.wallets.some((w) => w.id === toDelete.id), 'après les synchros suivantes : toujours archivé / supprimé');
  check((await count(`select count(*) as n from public.wallets where id = '${toArchive.id}' and archived`)) === 1, 'archivage envoyé à la base');
  check((await count(`select count(*) as n from public.wallets where id = '${toDelete.id}' and deleted_at is not null`)) === 1, 'suppression envoyée à la base');
  await a2.sync();
  check(a2.data.wallets.find((w) => w.id === toArchive.id)?.archived === true && !a2.data.wallets.some((w) => w.id === toDelete.id), 'le 2e appareil voit l\'archivage et la suppression');

  // 11b. Taux changé ici PENDANT une synchro qui ramène les réglages d'un autre appareil : on garde celui d'ici
  a2.data = { ...a2.data, settings: { ...a2.data.settings, rates: { ...a2.data.settings.rates, CDF: 0.0003 } } };
  await a2.sync();
  let touchedProfile = false;
  a1.remote = {
    ...a1.remote,
    pull: async (t, since) => {
      const rows = await realPull(t, since);
      if (t === 'profiles' && !touchedProfile) {
        touchedProfile = true;
        a1.data = { ...a1.data, settings: { ...a1.data.settings, rates: { ...a1.data.settings.rates, CDF: 0.00035 } } };
      }
      return rows;
    },
  };
  const r11b = await a1.sync();
  check(a1.data.settings.rates.CDF === 0.00035, 'taux changé pendant la synchro : reste celui tapé ici');
  check(r11b.status === 'done' && (r11b as { again?: boolean }).again === true, 'réglages : une nouvelle synchro est demandée');
  a1.remote = { ...a1.remote, pull: realPull };
  await a1.sync();
  await a2.sync();
  check(a1.data.settings.rates.CDF === 0.00035 && a2.data.settings.rates.CDF === 0.00035, 'le taux tapé est envoyé et arrive sur le 2e appareil');

  // 12. Invitation par lien : Alice crée un code, Bob rejoint avec (son e-mail n'est pas noté à l'avance)
  const shared = a1.data.wallets.find(
    (w) => !w.archived && !w.ownerId && w.id !== toArchive.id && w.id !== toDelete.id && w.id !== cash.id && a1.data.transactions.some((x) => x.walletId === w.id)
  )!;
  // Ses opérations datent d'avant la dernière synchro de Bob (sinon la marge de 2 min les ramènerait de toute façon)
  const old = await db.connect();
  await old.query(`set session_replication_role = replica`); // sans le déclencheur qui remet updated_at à maintenant
  await old.query(`update public.transactions set updated_at = now() - interval '1 hour' where wallet_id = $1`, [shared.id]);
  await old.query(`reset session_replication_role`);
  old.release();
  const code = await rpcAs(ALICE, 'alice@test.cd', `select create_wallet_invite($1) ->> 'code' as v`, [shared.id]);
  const joined = await rpcAs(BOB, 'bob@test.cd', `select join_wallet($1, 'Bobby') ->> 'status' as v`, [code.toLowerCase()]);
  check(joined === 'joined', `Bob rejoint « ${shared.name} » avec le code`);
  const r12 = await b1.sync(undefined, true); // comme useCloud juste après join_wallet
  const sharedTx = a1.data.transactions.filter((x) => x.walletId === shared.id).length;
  check(
    r12.status === 'done' && b1.data.wallets.some((w) => w.id === shared.id) && b1.data.transactions.filter((x) => x.walletId === shared.id).length === sharedTx,
    `Bob reçoit le portefeuille et ses ${sharedTx} opérations, anciennes comprises`
  );
  await a1.sync();
  const bobby = a1.data.wallets.find((w) => w.id === shared.id)?.members?.find((m) => m.userId === BOB);
  check(bobby?.name === 'Bobby' && !bobby.removed, 'Alice voit « Bobby » parmi les membres');
  const r12a = await a1.sync();
  const r12b = await b1.sync();
  check(r12a.status === 'done' && r12a.pushed === 0 && r12b.status === 'done' && r12b.pushed === 0, 'ensuite : rien à renvoyer, ni chez Alice ni chez Bob');
  check(b1.data.wallets.some((w) => w.id === shared.id), 'le portefeuille reste chez Bob');

  // 13. Deux onglets du même navigateur (même mémoire de synchro), l'un resté sur une vieille version
  await a1.sync();
  const tab2 = new Device('Alice-onglet2', structuredClone(a1.data), a1.remote);
  tab2.meta = structuredClone(a1.meta); // même localStorage
  const newTx = { ...a1.data.transactions[0], id: uuid(), title: 'Ajoutée dans l\'onglet 1', transferId: undefined, counterpartWalletId: undefined, memberId: undefined };
  const icon = { id: `custom:${Date.now()}`, name: 'Mon icône', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+', keepColors: false };
  a1.data = { ...a1.data, transactions: [newTx, ...a1.data.transactions], customIcons: [...a1.data.customIcons, icon] };
  await a1.sync();
  tab2.meta = structuredClone(a1.meta); // l'onglet 2 relit la mémoire écrite par l'onglet 1… mais pas ses données
  const r13 = await tab2.sync();
  check(r13.status === 'done', "l'onglet en retard se synchronise");
  check((await count(`select count(*) n from transactions where id = '${newTx.id}' and deleted_at is null`)) === 1, "l'onglet en retard ne supprime PAS l'opération ajoutée dans l'autre onglet");
  check((await count(`select count(*) n from custom_icons where id = '${icon.id}' and deleted_at is null`)) === 1, "ni l'icône ajoutée dans l'autre onglet");
  // Une vraie suppression faite dans l'onglet 2 (qui connaît l'opération) part bien
  const victim2 = tab2.data.transactions.find((t) => t.id !== newTx.id)!;
  tab2.data = { ...tab2.data, transactions: tab2.data.transactions.filter((t) => t.id !== victim2.id) };
  await tab2.sync();
  check((await count(`select count(*) n from transactions where id = '${victim2.id}' and deleted_at is not null`)) === 1, "une suppression faite dans l'onglet 2 est bien envoyée");

  console.log(failures ? `\n${failures} ÉCHEC(S)` : '\n=== Synchro : tous les tests sont passés ===');
  await db.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.end();
  process.exit(1);
});
