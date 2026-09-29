// Correspondance entre les données de l'app (camelCase, localStorage) et les tables Supabase (snake_case).
// Règle d'or : toRow(fromRow(ligne)) doit donner la même empreinte que la donnée locale,
// sinon la synchro renverrait sans fin des modifications qui n'en sont pas.
import { Budget, Ristourne, RistourneMember, RistournePayment, Settings, Transaction, Wallet, WalletMember } from '../../types';
import { Category } from '../../data/categories';
import { CustomIcon } from '../customIcons';
import { isUuid } from '../ids';

export type Row = Record<string, unknown>;

export const TABLES = ['profiles', 'categories', 'custom_icons', 'wallets', 'wallet_members', 'transactions', 'budgets', 'ristournes', 'ristourne_members', 'ristourne_payments'] as const;
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
});

export const budgetRow = (b: Budget): Row => ({
  id: b.id,
  category_id: b.categoryId,
  amount: b.amount,
  currency: b.currency,
  created_at: iso(b.createdAt),
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
    memberId,
  };
}

export const budgetFromRow = (r: Row): Budget => ({
  id: String(r.id),
  categoryId: (r.category_id as string | null) ?? null,
  amount: Number(r.amount),
  currency: String(r.currency),
  createdAt: iso(r.created_at),
});

// ---------- Ristournes ----------

export const ristourneRow = (r: Ristourne): Row => ({
  id: r.id,
  name: r.name,
  contribution: r.contribution,
  currency: r.currency,
  frequency: r.frequency,
  start_date: r.startDate,
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
});

export const ristourneFromRow = (row: Row, me: string, existing?: Ristourne): Ristourne => ({
  ...(existing ?? { members: [], payments: [] }),
  id: String(row.id),
  name: String(row.name),
  contribution: Number(row.contribution),
  currency: String(row.currency),
  frequency: row.frequency as Ristourne['frequency'],
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
});
