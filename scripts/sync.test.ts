// Test de bout en bout de la synchro, sur un PostgreSQL local avec le vrai schéma et les vraies règles
// d'accès (comptes simulés). Lancer : npx tsx scripts/sync.test.ts
// Prérequis : base « wallo_test » créée avec supabase/tests/local_auth_stub.sql + la migration.
import pg from 'pg';
import readXlsxFile from 'read-excel-file/node';
import { runSync, applyList, migrateIds, Remote, SyncMeta, SyncPatch } from '../src/lib/sync/engine';
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
  };
}

// Un « téléphone » : ses données locales + sa mémoire de synchro, et la même logique que l'app
class Device {
  meta: SyncMeta | null = null;
  constructor(public name: string, public data: SyncData, public remote: Remote) {}
  apply(p: SyncPatch) {
    const r = !!p.replaceAll;
    this.data = {
      ...this.data,
      wallets: applyList(this.data.wallets, p.wallets, r),
      transactions: applyList(this.data.transactions, p.transactions, r),
      categories: p.categories ? applyList(this.data.categories, p.categories, r) : this.data.categories,
      budgets: applyList(this.data.budgets, p.budgets, r),
      customIcons: applyList(this.data.customIcons, p.customIcons, r),
      ristournes: applyList(this.data.ristournes, p.ristournes, r),
      settings: p.settings ?? this.data.settings,
      profileName: p.profileName ?? this.data.profileName,
    };
  }
  async sync(decision?: 'merge' | 'replace') {
    const { data } = migrateIds(this.data);
    this.data = data;
    const res = await runSync(() => this.data, this.meta, this.remote, decision);
    if (res.status === 'needs-decision') return res;
    this.apply(res.patch);
    this.meta = res.meta;
    return res;
  }
}

const fresh = (): SyncData => ({
  wallets: [
    { id: 'wallet-cash', name: 'Cash', icon: 'Banknote', color: '#059669', currency: 'USD', initialBalance: 0, includeInTotal: true, archived: false },
    { id: 'wallet-momo', name: 'Mobile Money', icon: 'Smartphone', color: '#F97316', currency: 'USD', initialBalance: 0, includeInTotal: true, archived: false },
  ],
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  budgets: [],
  settings: { mainCurrency: 'USD', secondCurrency: null, rates: {} },
  profileName: '',
  customIcons: [],
  ristournes: [],
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
  const sheets = await readXlsxFile('/root/.claude/uploads/ce1f3682-f578-5503-b1a3-8a25c9832c47/c85c2d6b-MoneyLover_TotalWallet_TousCategory_01_01_2025-29_09_2026.xlsx');
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

  console.log(failures ? `\n${failures} ÉCHEC(S)` : '\n=== Synchro : tous les tests sont passés ===');
  await db.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.end();
  process.exit(1);
});
