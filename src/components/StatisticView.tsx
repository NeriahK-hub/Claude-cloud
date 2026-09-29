import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { countsInStats, formatMoney, toMain } from '../lib/money';
import { inPeriod, Period, periodRange } from '../lib/periods';
import { PeriodBar } from './PeriodBar';
import { IconBadge, WalletChipIcon } from './AppIcon';
import { TransactionItem } from './TransactionItem';

interface StatisticViewProps {
  allTransactions: Transaction[];
  wallets: Wallet[];
  activeWallet: Wallet | null; // null = total des portefeuilles inclus
  activeWalletLabel: string;
  categories: Category[];
  settings: Settings;
  onSelectTransaction: (tx: Transaction) => void;
  onOpenAccountPicker: () => void;
}

interface Slice {
  key: string;
  name: string;
  color: string;
  icon: string;
  image?: string;
  amount: number;
  txs: Transaction[];
}

// Rapport : solde d'ouverture / de fin, revenu net, et répartition par catégorie sur une période
export const StatisticView: React.FC<StatisticViewProps> = ({
  allTransactions,
  wallets,
  activeWallet,
  activeWalletLabel,
  categories,
  settings,
  onSelectTransaction,
  onOpenAccountPicker,
}) => {
  const [period, setPeriod] = useState<Period>({ kind: 'month', offset: 0 });
  const [side, setSide] = useState<'expense' | 'income'>('expense');
  const main = settings.mainCurrency;
  const money = (v: number) => formatMoney(v, main);

  const report = useMemo(() => {
    // Portefeuilles concernés : celui choisi, ou tous ceux comptés dans le total
    const scope = activeWallet ? [activeWallet] : wallets.filter((w) => w.includeInTotal && !w.archived);
    const ids = new Set(scope.map((w) => w.id));
    const txs = allTransactions.filter((t) => ids.has(t.walletId));
    const inMain = (t: Transaction) => toMain(t.amount, t.currency, settings);
    const initial = scope.reduce((s, w) => s + toMain(w.initialBalance, w.currency, settings), 0);
    const balanceAt = (d: Date | null) =>
      initial + txs.filter((t) => !d || new Date(t.createdAt) < d).reduce((s, t) => s + inMain(t), 0);

    const range = periodRange(period);
    const now = new Date();
    const end = range.end && range.end < now ? range.end : null; // période en cours : solde actuel
    const inRange = txs.filter((t) => inPeriod(t.createdAt, range));
    const counted = inRange.filter(countsInStats);

    // Regroupe par catégorie principale (les sous-catégories comptent dans leur parent)
    const group = (list: Transaction[], sign: 1 | -1): Slice[] => {
      const map = new Map<string, Slice>();
      for (const t of list) {
        const cat = categories.find((c) => c.id === t.categoryId);
        const top = cat?.parentId ? categories.find((c) => c.id === cat.parentId) ?? cat : cat;
        const key = top?.id ?? t.category;
        const cur =
          map.get(key) ??
          ({
            key,
            name: top?.name ?? t.category,
            color: top?.color ?? t.color,
            icon: top?.icon ?? (t.avatarType === 'icon' ? t.avatarValue : ''),
            image: top ? top.image : t.avatarType === 'image' ? t.avatarValue : undefined,
            amount: 0,
            txs: [],
          } as Slice);
        cur.amount += sign * inMain(t);
        cur.txs.push(t);
        map.set(key, cur);
      }
      return [...map.values()].sort((a, b) => b.amount - a.amount);
    };
    const incomeSlices = group(counted.filter((t) => t.amount > 0), 1);
    const expenseSlices = group(counted.filter((t) => t.amount < 0), -1);

    return {
      opening: range.start ? balanceAt(range.start) : initial,
      closing: balanceAt(end),
      current: balanceAt(null),
      income: incomeSlices.reduce((s, x) => s + x.amount, 0),
      expense: expenseSlices.reduce((s, x) => s + x.amount, 0),
      incomeSlices,
      expenseSlices,
    };
  }, [allTransactions, wallets, activeWallet, categories, settings, period]);

  const net = report.income - report.expense;
  const maxBar = Math.max(report.income, report.expense, 1);
  const slices = side === 'income' ? report.incomeSlices : report.expenseSlices;
  const sideTotal = side === 'income' ? report.income : report.expense;

  return (
    <div className="w-full bg-slate-50 px-5 pt-3 pb-28 animate-screen">
      {/* En-tête : portefeuille + solde */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Rapport</h1>
        <button
          onClick={onOpenAccountPicker}
          className="inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-white border border-slate-100 hover:bg-slate-100 cursor-pointer"
        >
          <WalletChipIcon wallet={activeWallet} />
          <span className="text-xs font-semibold text-slate-700 max-w-[140px] truncate">{activeWalletLabel}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
      <div className="text-center mb-3">
        <div className="text-xs font-medium text-slate-500">Solde</div>
        <div className="text-2xl font-extrabold tabular-nums text-slate-900">{money(report.current)}</div>
      </div>

      <PeriodBar value={period} onChange={setPeriod} />

      <div className="py-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Solde à l'ouverture</span>
          <span className="font-semibold tabular-nums text-slate-900">{money(report.opening)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Solde de fin</span>
          <span className="font-semibold tabular-nums text-slate-900">{money(report.closing)}</span>
        </div>
      </div>

      {/* Revenu net */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3">
        <div className="text-sm font-bold text-slate-900">Revenu net</div>
        <div className={`text-2xl font-extrabold tabular-nums mb-3 ${net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {net >= 0 ? '+' : '−'}
          {money(Math.abs(net))}
        </div>
        {(
          [
            ['Revenus', report.income, 'bg-emerald-500'],
            ['Dépenses', report.expense, 'bg-rose-500'],
          ] as const
        ).map(([label, v, bar]) => (
          <div key={label} className="mb-2 last:mb-0">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-slate-600">{label}</span>
              <span className="font-bold tabular-nums text-slate-900">{money(v)}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${(v / maxBar) * 100}%` }} />
            </div>
          </div>
        ))}
        <p className="text-[11px] text-slate-400 mt-2">Transferts entre portefeuilles et ajustements non comptés.</p>
      </div>

      {/* Rapport par catégorie */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4">
        <div className="text-sm font-bold text-slate-900 mb-3">Par catégorie</div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(
            [
              ['income', 'Revenus', report.income, 'text-emerald-600'],
              ['expense', 'Dépenses', report.expense, 'text-rose-600'],
            ] as const
          ).map(([id, label, v, tone]) => (
            <button
              key={id}
              onClick={() => setSide(id)}
              className={`text-left p-3 rounded-2xl border-2 cursor-pointer transition ${
                side === id ? 'border-slate-900 bg-slate-50' : 'border-transparent bg-slate-100 hover:bg-slate-200/70'
              }`}
            >
              <div className="text-xs font-semibold text-slate-500">{label}</div>
              <div className={`text-sm font-bold tabular-nums ${tone}`}>{money(v)}</div>
            </button>
          ))}
        </div>

        {slices.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            Aucun{side === 'income' ? ' revenu' : 'e dépense'} sur cette période.
          </p>
        ) : (
          <CategoryDonut slices={slices} total={sideTotal} money={money} onSelectTransaction={onSelectTransaction} />
        )}
      </div>
    </div>
  );
};

// ---------- Anneau + légende (la légende sert aussi de tableau des valeurs) ----------
const CategoryDonut: React.FC<{
  slices: Slice[];
  total: number;
  money: (v: number) => string;
  onSelectTransaction: (tx: Transaction) => void;
}> = ({ slices, total, money, onSelectTransaction }) => {
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const R = 44;
  const C = 2 * Math.PI * R;
  const GAP = slices.length > 1 ? 2 : 0; // 2 px de fond entre deux parts
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const focus = slices.find((s) => s.key === active);

  let acc = 0;
  return (
    <>
      <div className="flex justify-center mb-4">
        <svg viewBox="0 0 120 120" className="w-44 h-44 -rotate-90" role="img" aria-label="Répartition par catégorie">
          {slices.map((s) => {
            const len = (s.amount / total) * C;
            const offset = -acc;
            acc += len;
            const isActive = active === s.key;
            return (
              <circle
                key={s.key}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={isActive ? 20 : 16}
                strokeDasharray={`${Math.max(0.5, len - GAP)} ${C}`}
                strokeDashoffset={offset}
                opacity={active && !isActive ? 0.35 : 1}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive(isActive ? null : s.key)}
              >
                <title>{`${s.name} : ${money(s.amount)} (${pct(s.amount).toFixed(0)} %)`}</title>
              </circle>
            );
          })}
          <g className="rotate-90 origin-center">
            <text x="60" y="56" textAnchor="middle" className="fill-slate-500 text-[8px] font-semibold">
              {focus ? focus.name.slice(0, 16) : 'Total'}
            </text>
            <text x="60" y="70" textAnchor="middle" className="fill-slate-900 text-[10px] font-bold">
              {focus ? `${pct(focus.amount).toFixed(0)} %` : money(total)}
            </text>
          </g>
        </svg>
      </div>

      <div className="divide-y divide-slate-100">
        {slices.map((s) => (
          <div key={s.key}>
            <button
              onClick={() => setOpen(open === s.key ? null : s.key)}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
              className={`w-full flex items-center gap-3 py-2.5 text-left cursor-pointer rounded-xl ${active === s.key ? 'bg-slate-50' : ''}`}
            >
              <IconBadge icon={s.icon} image={s.image} color={s.color} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{s.name}</div>
                <div className="text-[11px] text-slate-500">
                  {s.txs.length} transaction{s.txs.length > 1 ? 's' : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold tabular-nums text-slate-900">{money(s.amount)}</div>
                <div className="text-[11px] tabular-nums text-slate-500">{pct(s.amount).toFixed(1)} %</div>
              </div>
              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${open === s.key ? 'rotate-90' : ''}`} />
            </button>
            {open === s.key && (
              <div className="pl-2 pb-2 animate-fade-in">
                {[...s.txs]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((t) => (
                    <TransactionItem key={t.id} transaction={t} onClick={onSelectTransaction} />
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};
