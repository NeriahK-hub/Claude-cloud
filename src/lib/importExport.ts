// Import / export des données.
// - Import : fichier Excel (.xlsx) ou CSV au format Money Lover (Date, Catégorie, Montant, Monnaie,
//   Portefeuille, Remarque, Avec, Exclure du rapport…), en français ou en anglais.
// - Export : même format Excel (réimportable ici ou ailleurs) + sauvegarde complète en JSON.
import { Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { convertBetween, countsInStats, rateToMain, toMain } from './money';
import { CustomIcon, getAllCustomIcons } from './customIcons';

// ---------- Lecture du fichier ----------

export interface RawRow {
  line: number; // numéro de ligne dans le fichier (pour les messages)
  date: Date;
  category: string;
  amount: number;
  currency: string;
  wallet: string;
  note: string;
  withPerson: string;
  excluded: boolean;
}

export interface ReadResult {
  rows: RawRow[];
  invalid: number[]; // lignes ignorées (date ou montant illisible)
}

type Cell = string | number | boolean | Date | null | undefined;

// "Catégorie" -> "categorie" (sans accents, minuscules, espaces simplifiés)
export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Noms de colonnes acceptés (Money Lover FR et EN)
const COLUMNS: Record<keyof Omit<RawRow, 'line'>, string[]> = {
  date: ['date'],
  category: ['categorie', 'category'],
  amount: ['montant', 'amount'],
  currency: ['monnaie', 'devise', 'currency'],
  wallet: ['portefeuille', 'wallet', 'compte', 'account'],
  note: ['remarque', 'note', 'description'],
  withPerson: ['avec', 'with'],
  excluded: ['exclure du rapport', 'exclude report', 'exclude from report'],
};

export async function readImportFile(file: File): Promise<ReadResult> {
  const name = file.name.toLowerCase();
  let table: Cell[][];
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    table = parseCsv(await file.text());
  } else {
    // Chargé seulement quand on importe (garde l'app légère)
    const { readSheet } = await import('read-excel-file/browser');
    table = (await readSheet(file)) as Cell[][];
  }
  return toRows(table);
}

export function toRows(table: Cell[][]): ReadResult {
  const headerIndex = table.findIndex((r) => r.some((c) => typeof c === 'string' && COLUMNS.amount.includes(norm(c))));
  if (headerIndex < 0) throw new Error("Colonnes introuvables : le fichier doit contenir au moins « Date », « Catégorie », « Montant » et « Portefeuille ».");
  const header = table[headerIndex].map((c) => (typeof c === 'string' ? norm(c) : ''));
  const col = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, names]) => [key, header.findIndex((h) => names.includes(h))])
  ) as Record<keyof typeof COLUMNS, number>;
  if (col.date < 0 || col.amount < 0 || col.wallet < 0) {
    throw new Error('Il manque une colonne obligatoire : « Date », « Montant » ou « Portefeuille ».');
  }

  const rows: RawRow[] = [];
  const invalid: number[] = [];
  const text = (r: Cell[], i: number) => (i < 0 || r[i] == null ? '' : String(r[i]).trim());
  table.slice(headerIndex + 1).forEach((r, k) => {
    const line = headerIndex + k + 2;
    if (r.every((c) => c == null || c === '')) return; // ligne vide
    const date = parseDate(r[col.date]);
    const amount = parseAmount(r[col.amount]);
    const wallet = text(r, col.wallet);
    if (amount === 0) return; // montant nul (ex. ajustement à 0) : rien à importer
    if (!date || amount === null || !wallet) return void invalid.push(line);
    const excl = norm(text(r, col.excluded));
    rows.push({
      line,
      date,
      category: text(r, col.category) || 'Sans catégorie',
      amount,
      currency: text(r, col.currency).toUpperCase(),
      wallet,
      note: text(r, col.note),
      withPerson: text(r, col.withPerson),
      excluded: !!excl && !['0', 'false', 'faux', 'non', 'no'].includes(excl),
    });
  });
  return { rows, invalid };
}

// Toujours à midi, heure locale : le jour ne change pas selon le fuseau horaire
function localNoon(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m, d, 12);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? date : null;
}

function parseDate(v: Cell): Date | null {
  if (v instanceof Date) {
    // Les dates Excel arrivent à minuit UTC : on garde le jour tel qu'écrit dans le fichier
    return isNaN(v.getTime()) ? null : localNoon(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  }
  if (typeof v === 'number') {
    // Numéro de série Excel (jours depuis le 30/12/1899)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return localNoon(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // 2026-09-29
  if (m) return localNoon(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); // 29/09/2026 (jour d'abord, comme Money Lover FR)
  if (m) return localNoon(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  return null;
}

function parseAmount(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/[\s  ]/g, '').replace(/[^\d,.\-+]/g, '');
  // "1.234,56" ou "1,234.56" : le dernier séparateur est la virgule décimale
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// CSV simple : détecte ; , ou tabulation, gère les guillemets
function parseCsv(text: string): Cell[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ',');
  const rows: Cell[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) row.push(cur), (cur = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cur), rows.push(row), (row = []), (cur = '');
    } else cur += ch;
  }
  if (cur || row.length) row.push(cur), rows.push(row);
  return rows;
}

// ---------- Préparation de l'import ----------

export interface ImportPlan {
  transactions: Transaction[];
  newWallets: Wallet[];
  newCategories: Category[];
  walletSummary: { name: string; currency: string; count: number; isNew: boolean }[];
  duplicates: number; // déjà présentes dans l'app : ignorées
  invalid: number[];
  from: Date | null;
  to: Date | null;
  transfers: number;
  adjustments: number;
  missingRates: string[]; // devises sans taux de change
}

const PALETTE = ['#F97316', '#3B82F6', '#EC4899', '#14B8A6', '#8B5CF6', '#EAB308', '#EF4444', '#0EA5E9', '#059669', '#64748B'];

// Catégories Money Lover qui ont un sens précis dans l'app
const TRANSFER_NAMES = ['transfert sortant', 'transfert entrant', 'outgoing transfer', 'incoming transfer', 'transfert', 'transfer'];
const ADJUST_NAMES = ['ajustement', 'ajuster le solde', 'adjust balance', 'balance adjustment'];
const ALIASES: Record<string, string | ((sign: number) => string)> = {
  pret: 'loan-given',
  loan: 'loan-given',
  dette: 'debt-taken',
  debt: 'debt-taken',
  remboursement: 'debt-repay',
  repayment: 'debt-repay',
  'recouvrement de creances': 'loan-back',
  'debt collection': 'loan-back',
  uncategorized: (sign) => (sign < 0 ? 'other-expense' : 'other-income'),
  'sans categorie': (sign) => (sign < 0 ? 'other-expense' : 'other-income'),
  'non categorise': (sign) => (sign < 0 ? 'other-expense' : 'other-income'),
};

// Une icône qui ressemble au nom (sinon une étiquette)
const ICON_HINTS: [RegExp, string][] = [
  [/music|musique|spotify|deezer/, 'Music'],
  [/netflix|stream|tv|canal|film/, 'Tv'],
  [/yango|uber|taxi|transport|moto/, 'Car'],
  [/vehic|voiture|garage|entretien|maintenance/, 'Wrench'],
  [/carbur|essence|fuel/, 'Fuel'],
  [/univ|ecole|school|education|cours|formation/, 'GraduationCap'],
  [/cadeau|gift|don/, 'Gift'],
  [/internet|wifi/, 'Wifi'],
  [/telephone|phone|credit|data|app/, 'Smartphone'],
  [/gaz|electric|courant|snel/, 'Zap'],
  [/eau|regideso|water/, 'Droplet'],
  [/facture|bill/, 'Receipt'],
  [/sante|medic|pharma|hopital|forme|sport/, 'HeartPulse'],
  [/maquillage|beaute|coiff/, 'Scissors'],
  [/caisse|cash|epargne|saving|salary|salaire/, 'PiggyBank'],
  [/interet|interest/, 'Coins'],
  [/marketing|pub/, 'Megaphone'],
  [/alim|food|nourrit|resto|repas/, 'Utensils'],
  [/shopping|achat|personal|habit|vetement/, 'ShoppingBag'],
  [/loisir|fun|sortie|plaisir/, 'PartyPopper'],
  [/abonnement|subscription|google|ai\b/, 'Sparkles'],
  [/business|travail|job/, 'Briefcase'],
];
const guessIcon = (name: string, sign: number) =>
  ICON_HINTS.find(([re]) => re.test(norm(name)))?.[1] ?? (sign < 0 ? 'Tag' : 'Wallet');

const guessWalletIcon = (name: string) => {
  const n = norm(name);
  if (/orange|airtel|vodacom|m-?pesa|africell|momo|mobile/.test(n)) return 'Smartphone';
  if (/cash|espece|liquide/.test(n)) return 'Banknote';
  if (/banque|bank|equity|rawbank|tmb|ecobank/.test(n)) return 'Landmark';
  if (/carte|card|visa/.test(n)) return 'CreditCard';
  return 'Wallet';
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const fingerprint = (t: Pick<Transaction, 'createdAt' | 'walletId' | 'amount' | 'category' | 'title'>) =>
  [dayKey(new Date(t.createdAt)), t.walletId, Math.round(t.amount * 100), norm(t.category), norm(t.title)].join('|');

export function planImport(
  read: ReadResult,
  current: { wallets: Wallet[]; categories: Category[]; transactions: Transaction[]; settings: Settings },
  replace: boolean
): ImportPlan {
  const stamp = Date.now();

  // --- Portefeuilles : même nom = même portefeuille ---
  const walletByName = new Map(current.wallets.map((w) => [norm(w.name), w]));
  const newWallets: Wallet[] = [];
  const counts = new Map<string, number>();
  for (const r of read.rows) {
    const key = norm(r.wallet);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (walletByName.has(key)) continue;
    const w: Wallet = {
      id: `wallet-imp-${stamp}-${newWallets.length}`,
      name: r.wallet,
      icon: guessWalletIcon(r.wallet),
      color: PALETTE[(current.wallets.length + newWallets.length) % PALETTE.length],
      currency: r.currency || current.settings.mainCurrency,
      initialBalance: 0,
      includeInTotal: true,
      archived: false,
      kind: 'basic',
    };
    walletByName.set(key, w);
    newWallets.push(w);
  }

  // --- Catégories : même nom (et même sens) = même catégorie, sinon on la crée ---
  const allCats = [...current.categories];
  const newCategories: Category[] = [];
  const fits = (c: Category, sign: number) =>
    sign < 0 ? c.type === 'expense' || (c.type === 'debt' && c.direction === 'out') : c.type === 'income' || (c.type === 'debt' && c.direction === 'in');
  const sameName = (a: string, b: string) => a === b || a.replace(/s$/, '') === b.replace(/s$/, '');
  const resolveCategory = (name: string, sign: number): Category => {
    const n = norm(name);
    const alias = ALIASES[n];
    const aliasId = typeof alias === 'function' ? alias(sign) : alias;
    const byAlias = aliasId && allCats.find((c) => c.id === aliasId);
    if (byAlias) return byAlias;
    const found = allCats.find((c) => fits(c, sign) && sameName(norm(c.name), n));
    if (found) return found;
    const cat: Category = {
      id: `imp-${stamp}-${newCategories.length}`,
      name,
      type: sign < 0 ? 'expense' : 'income',
      icon: guessIcon(name, sign),
      color: PALETTE[newCategories.length % PALETTE.length],
      custom: true,
    };
    allCats.push(cat);
    newCategories.push(cat);
    return cat;
  };

  // --- Doublons : une transaction identique déjà dans l'app (même jour, portefeuille, montant, catégorie, titre) ---
  const existing = new Map<string, number>();
  if (!replace) for (const t of current.transactions) existing.set(fingerprint(t), (existing.get(fingerprint(t)) ?? 0) + 1);

  let duplicates = 0;
  let transfers = 0;
  let adjustments = 0;
  const transactions: Transaction[] = [];
  const currencies = new Set<string>();
  read.rows.forEach((r, i) => {
    const wallet = walletByName.get(norm(r.wallet))!;
    currencies.add(wallet.currency);
    // Montant dans la devise du portefeuille
    const rowCurrency = r.currency || wallet.currency;
    const differs = rowCurrency !== wallet.currency;
    const amount = differs ? convertBetween(r.amount, rowCurrency, wallet.currency, current.settings) ?? r.amount : r.amount;
    const sign = Math.sign(amount);
    const catName = norm(r.category);
    const base = {
      id: `tx-imp-${stamp}-${i}`,
      createdAt: r.date.toISOString(),
      amount,
      currency: wallet.currency,
      walletId: wallet.id,
      originalAmount: differs ? r.amount : undefined,
      originalCurrency: differs ? rowCurrency : undefined,
      withPerson: r.withPerson || undefined,
      status: 'completed' as const,
    };

    let tx: Transaction;
    const isAdjust = ADJUST_NAMES.includes(catName) || (TRANSFER_NAMES.includes(catName) && /ajust|adjust/.test(norm(r.note)));
    if (isAdjust) {
      adjustments++;
      tx = { ...base, title: r.note || 'Ajustement du solde', type: 'adjustment', category: 'Ajustement', avatarType: 'icon', avatarValue: 'SlidersHorizontal', color: '#64748B' };
    } else if (TRANSFER_NAMES.includes(catName)) {
      transfers++;
      tx = {
        ...base,
        title: r.note || (sign < 0 ? 'Transfert sortant' : 'Transfert entrant'),
        type: 'transfer',
        category: 'Transfert',
        avatarType: 'icon',
        avatarValue: 'ArrowLeftRight',
        color: '#64748B',
        transferId: `tr-imp-${stamp}-${i}`,
      };
    } else {
      const cat = resolveCategory(r.category, sign);
      tx = {
        ...base,
        title: r.note || (r.withPerson ? `${cat.name} · ${r.withPerson}` : cat.name),
        type: sign < 0 ? 'payment' : 'receive',
        category: cat.name,
        categoryId: cat.id,
        avatarType: cat.image ? 'image' : 'icon',
        avatarValue: cat.image ?? cat.icon,
        color: cat.color,
        excludeFromReport: r.excluded || undefined,
      };
    }

    const fp = fingerprint(tx);
    const left = existing.get(fp) ?? 0;
    if (left > 0) {
      existing.set(fp, left - 1);
      duplicates++;
      return;
    }
    transactions.push(tx);
  });

  pairTransfers(transactions);

  // Catégories créées mais finalement inutilisées (lignes en double) : on ne les garde pas
  const used = new Set(transactions.map((t) => t.categoryId));
  const keptCategories = newCategories.filter((c) => used.has(c.id));
  const usedWallets = new Set(transactions.map((t) => t.walletId));
  const keptWallets = newWallets.filter((w) => usedWallets.has(w.id));

  const times = read.rows.map((r) => r.date.getTime());
  const newIds = new Set(newWallets.map((w) => w.id));
  return {
    transactions,
    newWallets: keptWallets,
    newCategories: keptCategories,
    walletSummary: [...walletByName.entries()]
      .filter(([key]) => counts.has(key))
      .map(([key, w]) => ({ name: w.name, currency: w.currency, count: counts.get(key)!, isNew: newIds.has(w.id) }))
      .sort((a, b) => b.count - a.count),
    duplicates,
    invalid: read.invalid,
    from: times.length ? new Date(Math.min(...times)) : null,
    to: times.length ? new Date(Math.max(...times)) : null,
    transfers,
    adjustments,
    missingRates: [...currencies].filter((c) => rateToMain(c, current.settings) === null),
  };
}

// Money Lover exporte les deux moitiés d'un transfert séparément : on relie une sortie et une entrée
// du même jour, du même montant et de la même devise, entre deux portefeuilles différents.
function pairTransfers(txs: Transaction[]) {
  const outs = txs.filter((t) => t.type === 'transfer' && t.amount < 0);
  const ins = txs.filter((t) => t.type === 'transfer' && t.amount > 0);
  const free = new Map<string, Transaction[]>();
  for (const t of ins) {
    const k = `${dayKey(new Date(t.createdAt))}|${t.currency}|${Math.round(t.amount * 100)}`;
    free.set(k, [...(free.get(k) ?? []), t]);
  }
  for (const out of outs) {
    const k = `${dayKey(new Date(out.createdAt))}|${out.currency}|${Math.round(-out.amount * 100)}`;
    const list = free.get(k);
    const idx = list?.findIndex((t) => t.walletId !== out.walletId) ?? -1;
    if (!list || idx < 0) continue;
    const inn = list.splice(idx, 1)[0];
    inn.transferId = out.transferId;
    out.counterpartWalletId = inn.walletId;
    inn.counterpartWalletId = out.walletId;
  }
}

// ---------- Export ----------

const EXPORT_HEADER = ['Id', 'Date', 'Catégorie', 'Montant', 'Monnaie', 'Portefeuille', 'Remarque', 'Avec', 'Événement', 'Exclure du rapport', 'Membres'];

function exportCategory(t: Transaction) {
  // Même vocabulaire que Money Lover pour pouvoir réimporter
  if (t.type === 'transfer' || t.type === 'adjustment') return t.amount < 0 ? 'Transfert sortant' : 'Transfert entrant';
  return t.category;
}

export function fileStamp(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function exportExcel(data: { wallets: Wallet[]; transactions: Transaction[]; settings: Settings }) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const walletName = new Map(data.wallets.map((w) => [w.id, w.name]));
  // Portefeuille partagé : qui a fait l'opération
  const memberName = (t: Transaction) =>
    t.memberId ? data.wallets.find((w) => w.id === t.walletId)?.members?.find((m) => m.id === t.memberId)?.name ?? null : null;
  const sorted = [...data.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const bold = (value: string) => ({ value, fontWeight: 'bold' as const });

  const rows = sorted.map((t, i) => {
    const d = new Date(t.createdAt);
    const note = t.type === 'adjustment' ? t.title || 'Ajuster le solde' : t.title !== t.category ? t.title : null;
    return [
      i + 1,
      { value: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), type: Date, format: 'dd/mm/yyyy' },
      exportCategory(t),
      t.amount,
      t.currency,
      walletName.get(t.walletId) ?? '',
      note,
      t.withPerson ?? null,
      null,
      countsInStats(t) ? null : '✅',
      memberName(t),
    ];
  });

  // Totaux par catégorie en devise principale (comme les onglets Revenu / Dépense de Money Lover)
  const totals = (sign: 1 | -1) => {
    const map = new Map<string, number>();
    for (const t of data.transactions) {
      if (!countsInStats(t) || Math.sign(t.amount) !== sign) continue;
      map.set(t.category, (map.get(t.category) ?? 0) + sign * toMain(t.amount, t.currency, data.settings));
    }
    return [
      [bold('Catégorie'), bold('Montant'), bold('Monnaie')],
      ...[...map].sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, Math.round(v * 100) / 100, data.settings.mainCurrency]),
    ];
  };

  await writeXlsxFile([
    {
      sheet: 'Transactions',
      data: [EXPORT_HEADER.map(bold), ...rows],
      columns: [{ width: 7 }, { width: 12 }, { width: 24 }, { width: 14 }, { width: 9 }, { width: 24 }, { width: 32 }, { width: 18 }, { width: 12 }, { width: 10 }, { width: 10 }],
      stickyRowsCount: 1,
    },
    { sheet: 'Revenu', data: totals(1), columns: [{ width: 28 }, { width: 16 }, { width: 10 }] },
    { sheet: 'Dépense', data: totals(-1), columns: [{ width: 28 }, { width: 16 }, { width: 10 }] },
  ] as never).toFile(`AetherPay_${fileStamp()}.xlsx`);
}

// ---------- Sauvegarde complète (JSON) ----------

export interface Backup {
  app: 'aetherpay';
  version: 1;
  exportedAt: string;
  wallets: Wallet[];
  transactions: Transaction[];
  categories: Category[];
  settings: Settings;
  customIcons: CustomIcon[];
}

export function exportBackup(data: Omit<Backup, 'app' | 'version' | 'exportedAt' | 'customIcons'>) {
  const backup: Backup = { app: 'aetherpay', version: 1, exportedAt: new Date().toISOString(), ...data, customIcons: getAllCustomIcons() };
  download(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `AetherPay_sauvegarde_${fileStamp()}.json`);
}

export async function readBackup(file: File): Promise<Backup> {
  let data: Partial<Backup>;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Ce fichier JSON est illisible.");
  }
  if (data?.app !== 'aetherpay' || !Array.isArray(data.wallets) || !Array.isArray(data.transactions) || !Array.isArray(data.categories) || !data.settings) {
    throw new Error("Ce n'est pas une sauvegarde AetherPay.");
  }
  return data as Backup;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
