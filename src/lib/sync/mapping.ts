// Correspondance entre les données de l'app (camelCase, localStorage) et les tables Supabase (snake_case).
// Règle d'or : toRow(fromRow(ligne)) doit donner la même empreinte que la donnée locale,
// sinon la synchro renverrait sans fin des modifications qui n'en sont pas.
import { Budget, DebtMove, DebtShare, GoalChallenge, Recurring, Ristourne, RistourneMember, RistournePayment, Settings, Transaction, Wallet, WalletMember } from '../../types';
import { Category } from '../../data/categories';
import { CustomIcon } from '../customIcons';
import { isUuid } from '../ids';

export type Row = Record<string, unknown>;

export const TABLES = ['profiles', 'categories', 'custom_icons', 'wallets', 'wallet_members', 'transactions', 'budgets', 'ristournes', 'ristourne_members', 'ristourne_payments', 'debt_shares', 'debt_moves', 'recurrings'] as const;
export type TableName = (typeof TABLES)[number];

// Tout ce qui se synchronise
export interface SyncData {
  wallets: Wallet[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  settings: Settings;
  profileName: string;
  customIcons: CustomIcon[];
  ristournes: Ristourne[];
  debtShares: DebtShare[];
  recurrings: Recurring[];
}

// Empreinte courte d'une ligne (FNV-1a 32 bits) : sert à savoir ce qui a changé depuis la dernière synchro
export function fingerprint(row: Row): string {
  const s = JSON.stringify(row);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
const iso = (v: unknown) => new Date(String(v)).toISOString();
export const isEmail = (s?: string) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// ---------- Local -> base ----------

export function profileRow(d: SyncData, me: string): Row {
  return {
    id: me,
    name: d.profileName,
    main_currency: d.settings.mainCurrency,
    second_currency: d.settings.secondCurrency ?? null,
    rates: d.settings.rates ?? {},
  };
}

export const categoryRow = (c: Category, i: number, me: string): Row => ({
  user_id: me,
  id: c.id,
  name: c.name,
  type: c.type,
  icon: c.icon,
  image: c.image ?? null,
  color: c.color,
  parent_id: c.parentId ?? null,
  direction: c.direction ?? null,
  custom: !!c.custom,
  sort_order: i,
});

export const iconRow = (i: CustomIcon, me: string): Row => ({
  user_id: me,
  id: i.id,
  name: i.name,
  data_url: i.dataUrl,
  keep_colors: !!i.keepColors,
});

export const walletRow = (w: Wallet, i: number): Row => ({
  id: w.id,
  name: w.name,
  icon: w.icon,
  image: w.image ?? null,
  color: w.color,
  currency: w.currency,
  initial_balance: w.initialBalance,
  include_in_total: w.includeInTotal,
  archived: w.archived,
  kind: w.kind ?? 'basic',
  credit_limit: w.creditLimit ?? null,
  goal_amount: w.goalAmount ?? null,
  goal_date: w.goalDate ?? null,
  // Colonnes de 20261011000000_goals.sql : envoyées seulement si on s'en est servi
  // (un appareil qui ne les touche pas reste compatible avec une base pas encore migrée)
  ...(w.goalWhy !== undefined ? { goal_why: w.goalWhy.trim() || null } : {}),
  ...(w.goalReminder !== undefined
    ? { reminder_day: w.goalReminder?.day ?? null, reminder_amount: w.goalReminder?.amount ?? null }
    : {}),
  ...(w.roundUp !== undefined ? { round_up: w.roundUp } : {}),
  ...(w.challenge !== undefined ? { challenge: w.challenge ?? null } : {}),
  sort_order: i,
});

// Membres que J'AI le droit d'écrire : ceux des portefeuilles dont je suis propriétaire
export function memberRows(w: Wallet, me: string): Row[] {
  if (w.ownerId && w.ownerId !== me) return [];
  return (w.members ?? [])
    .filter((m) => !m.owner && m.userId !== me)
    .map((m) => memberRow(w.id, m));
}

export const memberRow = (walletId: string, m: WalletMember): Row => {
  const email = isEmail(m.contact) ? m.contact!.trim().toLowerCase() : null;
  return {
    id: m.id,
    wallet_id: walletId,
    name: m.name,
    color: m.color,
    email,
    role: 'member',
    status: m.removed ? 'removed' : m.userId ? 'active' : email ? 'invited' : 'active',
  };
};

export const transactionRow = (t: Transaction): Row => ({
  id: t.id,
  wallet_id: t.walletId,
  member_id: isUuid(t.memberId) ? t.memberId : null,
  title: t.title,
  occurred_at: iso(t.createdAt),
  amount: t.amount,
  currency: t.currency,
  original_amount: t.originalAmount ?? null,
  original_currency: t.originalCurrency ?? null,
  type: t.type,
  category: t.category,
  category_id: t.categoryId ?? null,
  avatar_type: t.avatarType,
  // Une image de catégorie n'est pas recopiée dans chaque opération : on la retrouve via la catégorie
  avatar_value: t.avatarType === 'image' ? '' : t.avatarValue,
  color: t.color,
  reference_number: t.referenceNumber ?? null,
  transfer_id: t.transferId ?? null,
  counterpart_wallet_id: isUuid(t.counterpartWalletId) ? t.counterpartWalletId : null,
  status: t.status ?? 'completed',
  exclude_from_report: !!t.excludeFromReport,
  with_person: t.withPerson ?? null,
  // Intérêts prévus : envoyés seulement s'ils ont servi (0 = retirés), la colonne peut manquer sur une base pas à jour
  ...(t.interest !== undefined ? { interest: t.interest || null } : {}),
  // Échéance d'un prêt : même principe (colonne ajoutée par 20261010000000_reminders.sql)
  ...(t.dueDate !== undefined ? { due_date: t.dueDate || null } : {}),
});

export const budgetRow = (b: Budget): Row => ({
  id: b.id,
  category_id: b.categoryId,
  amount: b.amount,
  currency: b.currency,
  created_at: iso(b.createdAt),
  period: b.period ?? 'month',
  start_date: b.period === 'custom' ? b.from ?? null : null,
  end_date: b.period === 'custom' ? b.to ?? null : null,
});

// ---------- Base -> local ----------

export const settingsFromRow = (r: Row): Settings => ({
  mainCurrency: String(r.main_currency),
  secondCurrency: (r.second_currency as string | null) ?? null,
  rates: (r.rates as Record<string, number>) ?? {},
});

export const categoryFromRow = (r: Row): Category => ({
  id: String(r.id),
  name: String(r.name),
  type: r.type as Category['type'],
  icon: String(r.icon),
  image: (r.image as string | null) ?? undefined,
  color: String(r.color),
  parentId: (r.parent_id as string | null) ?? undefined,
  direction: (r.direction as Category['direction'] | null) ?? undefined,
  custom: r.custom ? true : undefined,
});

export const iconFromRow = (r: Row): CustomIcon => ({
  id: String(r.id),
  name: String(r.name),
  dataUrl: String(r.data_url),
  keepColors: !!r.keep_colors,
});

export function walletFromRow(r: Row, me: string, existing?: Wallet): Wallet {
  return {
    ...(existing ?? {}),
    id: String(r.id),
    name: String(r.name),
    icon: String(r.icon),
    image: (r.image as string | null) ?? undefined,
    color: String(r.color),
    currency: String(r.currency),
    initialBalance: Number(r.initial_balance),
    includeInTotal: !!r.include_in_total,
    archived: !!r.archived,
    kind: r.kind as Wallet['kind'],
    creditLimit: num(r.credit_limit),
    goalAmount: num(r.goal_amount),
    goalDate: (r.goal_date as string | null) ?? undefined,
    goalWhy: (r.goal_why as string | null) ?? undefined,
    goalReminder:
      r.reminder_day != null && r.reminder_amount != null ? { day: Number(r.reminder_day), amount: Number(r.reminder_amount) } : undefined,
    roundUp: r.round_up ? true : undefined,
    challenge: r.challenge ? (r.challenge as GoalChallenge) : undefined,
    ownerId: r.owner_id === me ? undefined : String(r.owner_id),
    members: existing?.members,
    myMemberId: existing?.myMemberId,
  };
}

// Fusionne des lignes de membres dans un portefeuille local (ma propre ligne -> myMemberId)
export function mergeMembers(w: Wallet, rows: Row[], me: string): Wallet {
  let members = [...(w.members ?? [])];
  let myMemberId = w.myMemberId;
  for (const r of rows) {
    if (r.user_id === me) {
      myMemberId = String(r.id);
      continue;
    }
    const old = members.find((m) => m.id === r.id);
    // Un téléphone noté ici (pas un e-mail) reste sur cet appareil
    const contact = (r.email as string | null) ?? (old?.contact && !isEmail(old.contact) ? old.contact : undefined);
    const m: WalletMember = {
      id: String(r.id),
      name: String(r.name),
      color: String(r.color),
      contact,
      userId: (r.user_id as string | null) ?? undefined,
      removed: r.status === 'removed' || !!r.deleted_at ? true : undefined,
      invited: r.status === 'invited' ? true : undefined,
      owner: r.role === 'owner' ? true : undefined,
    };
    members = old ? members.map((x) => (x.id === m.id ? m : x)) : [...members, m];
  }
  return { ...w, members, myMemberId };
}

export function transactionFromRow(r: Row, me: string, wallets: Wallet[], categories: Category[]): Transaction {
  const w = wallets.find((x) => x.id === r.wallet_id);
  // Qui a fait l'opération, vu depuis CE téléphone (absent = moi)
  let memberId: string | undefined;
  if (r.member_id && r.member_id !== w?.myMemberId) memberId = String(r.member_id);
  else if (!r.member_id && r.created_by && r.created_by !== me) memberId = w?.members?.find((m) => m.userId === r.created_by)?.id;
  const cat = categories.find((c) => c.id === r.category_id);
  const isImage = r.avatar_type === 'image';
  return {
    id: String(r.id),
    title: String(r.title),
    createdAt: iso(r.occurred_at),
    amount: Number(r.amount),
    currency: String(r.currency),
    walletId: String(r.wallet_id),
    originalAmount: num(r.original_amount),
    originalCurrency: (r.original_currency as string | null) ?? undefined,
    type: r.type as Transaction['type'],
    category: String(r.category),
    categoryId: (r.category_id as string | null) ?? undefined,
    avatarType: isImage && cat?.image ? 'image' : 'icon',
    avatarValue: isImage ? cat?.image ?? cat?.icon ?? 'Tag' : String(r.avatar_value),
    color: String(r.color),
    referenceNumber: (r.reference_number as string | null) ?? undefined,
    transferId: (r.transfer_id as string | null) ?? undefined,
    counterpartWalletId: (r.counterpart_wallet_id as string | null) ?? undefined,
    status: r.status as Transaction['status'],
    excludeFromReport: r.exclude_from_report ? true : undefined,
    withPerson: (r.with_person as string | null) ?? undefined,
    interest: r.interest != null ? Number(r.interest) : undefined,
    dueDate: r.due_date ? String(r.due_date).slice(0, 10) : undefined,
    memberId,
  };
}

export const budgetFromRow = (r: Row): Budget => ({
  id: String(r.id),
  categoryId: (r.category_id as string | null) ?? null,
  amount: Number(r.amount),
  currency: String(r.currency),
  createdAt: iso(r.created_at),
  period: (r.period as Budget['period']) ?? 'month',
  from: r.start_date ? String(r.start_date).slice(0, 10) : undefined,
  to: r.end_date ? String(r.end_date).slice(0, 10) : undefined,
});

// ---------- Ristournes ----------

export const ristourneRow = (r: Ristourne): Row => ({
  id: r.id,
  name: r.name,
  contribution: r.contribution,
  currency: r.currency,
  frequency: r.frequency,
  start_date: r.startDate,
  // Seulement pour une fréquence personnalisée (les autres restent valables sur une base pas encore à jour)
  ...(r.frequency === 'custom' ? { every_days: r.everyDays ?? 1 } : {}),
  // Gardien de l'argent : envoyé seulement s'il a été choisi (base à jour obligatoire)
  ...(r.keeperId || r.holding ? { keeper_member_id: r.keeperId ?? null, holding: r.holding ?? null, holding_details: r.holdingDetails ?? null } : {}),
});

// Membres : seul le propriétaire les écrit
export function ristourneMemberRows(r: Ristourne, me: string): Row[] {
  if (r.ownerId && r.ownerId !== me) return [];
  return r.members.map((m) => {
    const email = isEmail(m.contact) ? m.contact!.trim().toLowerCase() : null;
    return {
      id: m.id,
      ristourne_id: r.id,
      user_id: m.isMe ? me : m.userId ?? null,
      email,
      name: m.name,
      turn: m.turn,
      status: m.removed ? 'removed' : m.isMe || m.userId ? 'active' : email ? 'invited' : 'active',
    };
  });
}

export const paymentRow = (r: Ristourne, p: RistournePayment): Row => ({
  id: p.id,
  ristourne_id: r.id,
  member_id: p.memberId,
  turn: p.turn,
  amount: p.amount,
  paid_at: iso(p.paidAt),
  // « À confirmer » : envoyé seulement quand on s'en sert (les anciens paiements restent comme avant)
  ...(p.pending !== undefined ? { pending: p.pending } : {}),
});

export const ristourneFromRow = (row: Row, me: string, existing?: Ristourne): Ristourne => ({
  ...(existing ?? { members: [], payments: [] }),
  id: String(row.id),
  name: String(row.name),
  contribution: Number(row.contribution),
  currency: String(row.currency),
  frequency: row.frequency as Ristourne['frequency'],
  everyDays: row.frequency === 'custom' && row.every_days != null ? Number(row.every_days) : undefined,
  keeperId: row.keeper_member_id ? String(row.keeper_member_id) : undefined,
  holding: row.holding === 'cash' || row.holding === 'digital' ? row.holding : undefined,
  holdingDetails: row.holding_details ? String(row.holding_details) : undefined,
  startDate: String(row.start_date).slice(0, 10),
  ownerId: row.owner_id === me ? undefined : String(row.owner_id),
});

export const ristourneMemberFromRow = (row: Row, me: string, old?: RistourneMember): RistourneMember => ({
  id: String(row.id),
  name: String(row.name),
  turn: Number(row.turn),
  isMe: row.user_id === me ? true : undefined,
  contact: (row.email as string | null) ?? (old?.contact && !isEmail(old.contact) ? old.contact : undefined),
  userId: row.user_id && row.user_id !== me ? String(row.user_id) : undefined,
  invited: row.status === 'invited' ? true : undefined,
  removed: row.status === 'removed' || !!row.deleted_at ? true : undefined,
});

export const paymentFromRow = (row: Row): RistournePayment => ({
  id: String(row.id),
  memberId: String(row.member_id),
  turn: Number(row.turn),
  amount: Number(row.amount),
  paidAt: iso(row.paid_at),
  pending: row.pending === true ? true : row.pending === false ? false : undefined,
});

// ---------- Dettes partagées ----------
// La dette elle-même n'est écrite que par celle ou celui qui l'a partagée (owner) ;
// les mouvements, par les deux. Chacun ne relie que ses propres opérations (owner_tx_id / guest_tx_id).

export const debtShareRow = (s: DebtShare): Row => ({
  id: s.id,
  owner_side: s.side,
  owner_label: s.person,
});

export const debtMoveRow = (s: DebtShare, m: DebtMove): Row => ({
  id: m.id,
  share_id: s.id,
  kind: m.kind,
  amount: m.amount,
  currency: m.currency,
  occurred_at: iso(m.date),
  note: m.note ?? null,
  pending: m.pending,
  delete_requested_by: m.deleteRequestedBy ?? null,
  [s.ownerId ? 'guest_tx_id' : 'owner_tx_id']: m.txId ?? null,
});

const flip = (side: unknown): DebtShare['side'] => (side === 'receivable' ? 'payable' : 'receivable');

export const debtShareFromRow = (row: Row, me: string, existing?: DebtShare): DebtShare => {
  const owner = row.owner_id === me;
  return {
    id: String(row.id),
    side: owner ? (row.owner_side as DebtShare['side']) : flip(row.owner_side),
    // L'owner : son nom pour l'autre est en ligne ; l'invité : le nom choisi en acceptant, puis celui qu'il donne ici
    person: owner ? String(row.owner_label) : existing?.person ?? (String(row.guest_label ?? '') || 'Sans nom'),
    status: row.status as DebtShare['status'],
    otherLeft: (owner ? row.guest_left_at : row.owner_left_at) ? true : undefined,
    ownerId: owner ? undefined : String(row.owner_id),
    moves: existing?.moves ?? [],
  };
};

export const debtMoveFromRow = (row: Row, iAmOwner: boolean): DebtMove => ({
  id: String(row.id),
  kind: row.kind as DebtMove['kind'],
  amount: Number(row.amount),
  currency: String(row.currency),
  date: iso(row.occurred_at),
  note: row.note ? String(row.note) : undefined,
  pending: row.pending === true,
  recordedBy: row.recorded_by ? String(row.recorded_by) : '',
  deleteRequestedBy: row.delete_requested_by ? String(row.delete_requested_by) : undefined,
  txId: (iAmOwner ? row.owner_tx_id : row.guest_tx_id) ? String(iAmOwner ? row.owner_tx_id : row.guest_tx_id) : undefined,
});

// ---------- Opérations qui reviennent / factures ----------
// (table de 20261012000000_upcoming.sql ; user_id est mis par la base à la création)

export const recurringRow = (r: Recurring): Row => ({
  id: r.id,
  wallet_id: r.walletId,
  title: r.title,
  amount: r.amount ?? null,
  currency: r.currency,
  direction: r.direction,
  category_id: r.categoryId ?? null,
  frequency: r.frequency,
  every_days: r.frequency === 'days' ? r.everyDays ?? 1 : null,
  // seulement quand c'est réglé (1 compris : on revient à « chaque mois ») ; tant que les migrations 20261019 et
  // 20261020 ne sont pas passées, les anciennes lignes ne changent pas
  ...(r.frequency !== 'days' && r.every !== undefined ? { every_n: r.every } : {}),
  ...(r.cancelBy !== undefined ? { cancel_by: r.cancelBy || null } : {}),
  next_date: r.nextDate,
  anchor_day: r.anchorDay ?? null,
  mode: r.mode,
  is_bill: !!r.bill,
  remind_days: r.remindDays ?? 3,
  active: r.active,
  created_at: iso(r.createdAt),
});

export const recurringFromRow = (r: Row, me: string): Recurring => ({
  id: String(r.id),
  walletId: String(r.wallet_id),
  title: String(r.title),
  amount: r.amount != null ? Number(r.amount) : undefined,
  currency: String(r.currency),
  direction: r.direction === 'in' ? 'in' : 'out',
  categoryId: (r.category_id as string | null) ?? undefined,
  frequency: r.frequency as Recurring['frequency'],
  everyDays: r.every_days != null ? Number(r.every_days) : undefined,
  every: r.every_n != null && Number(r.every_n) > 1 ? Number(r.every_n) : undefined,
  cancelBy: r.cancel_by ? String(r.cancel_by).slice(0, 10) : undefined,
  nextDate: String(r.next_date).slice(0, 10),
  anchorDay: r.anchor_day != null ? Number(r.anchor_day) : undefined,
  mode: r.mode === 'auto' ? 'auto' : 'ask',
  bill: r.is_bill ? true : undefined,
  remindDays: r.remind_days != null ? Number(r.remind_days) : undefined,
  active: !!r.active,
  createdBy: r.user_id && r.user_id !== me ? String(r.user_id) : undefined,
  createdAt: iso(r.created_at),
});
