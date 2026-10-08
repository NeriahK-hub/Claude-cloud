import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Share2, Loader2 } from 'lucide-react';
import { Budget, Recurring, Settings, Transaction, Wallet } from '../types';
import { ReportTools } from './ReportTools';
import type { Page } from './BottomNav';
import { Category } from '../data/categories';
import { countsInReport, fitAmount, formatMoney, toMain } from '../lib/money';
import { inPeriod, Period, periodLabel, periodRange } from '../lib/periods';
import { shareReport } from '../lib/shareReport';
import { PeriodBar } from './PeriodBar';
import { periodBalances, reportScope } from '../lib/report';
import { IconBadge, WalletChipIcon } from './AppIcon';
import { TransactionItem } from './TransactionItem';
import { useIsDesktop } from '../hooks/useIsDesktop';

interface StatisticViewProps {
  allTransactions: Transaction[];
  wallets: Wallet[];
  activeWallet: Wallet | null; // null = total des portefeuilles inclus
  activeWalletLabel: string;
  categories: Category[];
  settings: Settings;
  onSelectTransaction: (tx: Transaction) => void;
  onOpenAccountPicker: () => void;
  onBack?: () => void; // téléphone : le Rapport s'ouvre depuis Transactions, avec un retour
  initialPeriod?: Period; // « Afficher le rapport pour cette période »
  budgets?: Budget[];
  onNavigate?: (page: Page) => void;
}

interface Slice {
  key: string;
  name: string;
  color: string;
  icon: string;
  image?: string;
  amount: number;
  txs: Transaction[];
  subs: Slice[]; // sous-catégories (la catégorie parente elle-même compte comme une ligne si elle a ses propres opérations)
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
  onBack,
  initialPeriod,
  budgets = [],
  onNavigate,
}) => {
  const [period, setPeriod] = useState<Period>(initialPeriod ?? { kind: 'month', offset: 0 });
  const [side, setSide] = useState<'expense' | 'income'>('expense');
  const desktop = useIsDesktop();
  const main = settings.mainCurrency;
  const money = (v: number) => formatMoney(v, main);

  const report = useMemo(() => {
    const scope = reportScope(wallets, activeWallet);
    const ids = new Set(scope.map((w) => w.id));
    const txs = allTransactions.filter((t) => ids.has(t.walletId));
    const inMain = (t: Transaction) => toMain(t.amount, t.currency, settings);
    const range = periodRange(period);
    const inRange = txs.filter((t) => inPeriod(t.createdAt, range));
    // Total : les transferts vers un portefeuille exclu du total comptent comme une sortie
    const counted = inRange.filter((t) => countsInReport(t, activeWallet ? null : ids));

    // Regroupe par catégorie principale (les sous-catégories comptent dans leur parent)
    const slice = (key: string, cat: Category | undefined, t: Transaction): Slice => ({
      key,
      name: cat?.name ?? t.category,
      color: cat?.color ?? t.color,
      icon: cat?.icon ?? (t.avatarType === 'icon' ? t.avatarValue : ''),
      image: cat ? cat.image : t.avatarType === 'image' ? t.avatarValue : undefined,
      amount: 0,
      txs: [],
      subs: [],
    });
    const group = (list: Transaction[], sign: 1 | -1): Slice[] => {
      const map = new Map<string, Slice>();
      for (const t of list) {
        const cat = categories.find((c) => c.id === t.categoryId);
        const top = cat?.parentId ? categories.find((c) => c.id === cat.parentId) ?? cat : cat;
        const key = top?.id ?? t.category;
        const cur = map.get(key) ?? slice(key, top, t);
        const v = sign * inMain(t);
        cur.amount += v;
        cur.txs.push(t);
        // Ligne de la sous-catégorie (ou du parent lui-même)
        const subKey = cat && cat !== top ? cat.id : `${key}:self`;
        let sub = cur.subs.find((x) => x.key === subKey);
        if (!sub) cur.subs.push((sub = slice(subKey, cat && cat !== top ? cat : top, t)));
        sub.amount += v;
        sub.txs.push(t);
        map.set(key, cur);
      }
      const sorted = [...map.values()].sort((a, b) => b.amount - a.amount);
      sorted.forEach((x) => x.subs.sort((a, b) => b.amount - a.amount));
      return sorted;
    };
    const incomeSlices = group(counted.filter((t) => t.amount > 0), 1);
    const expenseSlices = group(counted.filter((t) => t.amount < 0), -1);

    return {
      scoped: txs.filter((t) => countsInReport(t, activeWallet ? null : ids)),
      periodTxs: counted,
      ...periodBalances(allTransactions, scope, period, settings),
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

  const change = report.closing - report.opening;

  // Calendrier, comparer, « Où part mon argent ? », PDF
  // Le PDF garde un nom de période qui ne change pas avec le temps (« Octobre 2026 », pas « Ce mois-ci »)
  const fixedLabel = (() => {
    const { start } = periodRange(period);
    if (!start) return periodLabel(period);
    if (period.kind === 'month') {
      const t = start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
    if (period.kind === 'year') return String(start.getFullYear());
    return periodLabel(period);
  })();
  const tools = (
    <ReportTools
      txs={report.scoped}
      allTransactions={allTransactions}
      wallets={wallets}
      budgets={budgets}
      categories={categories}
      settings={settings}
      onSelectTransaction={onSelectTransaction}
      onNavigate={onNavigate}
      pdf={{
        title: `Rapport · ${fixedLabel}`,
        periodLabel: fixedLabel,
        scope: activeWalletLabel,
        income: report.income,
        expense: report.expense,
        opening: report.opening,
        closing: report.closing,
        expenseSlices: report.expenseSlices.map((x) => ({ name: x.name, color: x.color, amount: x.amount })),
        transactions: report.periodTxs,
      }}
    />
  );

  // Rapport en image, à envoyer sur WhatsApp
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    setSharing(true);
    try {
      const label = periodLabel(period);
      await shareReport(
        {
          title: `Rapport · ${label}`,
          subtitle: activeWalletLabel,
          income: `+${money(report.income)}`,
          expense: `−${money(report.expense)}`,
          net: `${net >= 0 ? '+' : '−'}${money(Math.abs(net))}`,
          netPositive: net >= 0,
          opening: money(report.opening),
          closing: money(report.closing),
          top: report.expenseSlices.map((x) => ({ name: x.name, color: x.color, amount: money(x.amount), share: report.expense > 0 ? x.amount / report.expense : 0 })),
        },
        `wallo-rapport-${label.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.png`
      );
    } catch {
      // image impossible (vieux navigateur) : rien à faire
    } finally {
      setSharing(false);
    }
  };
  const shareBtn = (
    <button
      onClick={share}
      disabled={sharing}
      aria-label="Partager le rapport en image"
      title="Partager le rapport en image"
      className={`shrink-0 h-10 rounded-full bg-white border border-slate-100 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${desktop ? 'px-3.5' : 'w-10'}`}
    >
      {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
      {desktop && 'Partager'}
    </button>
  );
  // Morceaux communs aux mises en page téléphone et ordinateur
  const netCard = (
    <div className={`bg-white rounded-3xl border border-slate-100 ${desktop ? 'p-6' : 'p-4 mb-3'}`}>
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
            <div className={`h-full rounded-full animate-bar ${bar}`} style={{ width: `${(v / maxBar) * 100}%` }} />
          </div>
        </div>
      ))}
      {/* En une phrase, ce que disent les barres */}
      {(report.income > 0 || report.expense > 0) && (
        <p className={`mt-3 text-[14px] font-semibold leading-snug ${net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {report.income <= 0
            ? `Pas de revenu noté : tu as dépensé ${money(report.expense)}.`
            : net >= 0
              ? `Tu as gardé ${Math.round((net / report.income) * 100)}\u00a0% de ce que tu as reçu.`
              : `Tu as dépensé ${money(-net)} de plus que ce que tu as reçu.`}
        </p>
      )}
      <p className="text-[12px] text-slate-400 mt-2">Transferts entre portefeuilles et ajustements non comptés.</p>
    </div>
  );
  const categoryCard = (
    <div className={`bg-white rounded-3xl border border-slate-100 ${desktop ? 'p-6' : 'p-4'}`}>
      <div className="text-sm font-bold text-slate-900 mb-3">Par catégorie</div>
      <div className={`grid grid-cols-2 gap-2 ${desktop ? 'mb-6 max-w-md' : 'mb-4'}`}>
        {(
          [
            ['income', 'Revenus', report.income, 'text-emerald-600'],
            ['expense', 'Dépenses', report.expense, 'text-rose-600'],
          ] as const
        ).map(([id, label, v, tone]) => (
          <button
            key={id}
            onClick={() => setSide(id)}
            className={`min-w-0 text-left p-3 rounded-2xl border-2 cursor-pointer transition ${
              side === id ? 'is-selected border-transparent' : 'border-transparent bg-slate-100 hover:bg-slate-200/70'
            }`}
          >
            <div className="text-xs font-semibold text-slate-500">{label}</div>
            <div className={`${fitAmount(money(v))} font-bold tabular-nums whitespace-nowrap ${tone}`}>{money(v)}</div>
          </button>
        ))}
      </div>

      {slices.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">
          Aucun{side === 'income' ? ' revenu' : 'e dépense'} sur cette période.
        </p>
      ) : (
        <>
          <CategoryDonut wide={desktop} slices={slices} total={sideTotal} money={money} onSelectTransaction={onSelectTransaction} />
          {/* En une phrase : la plus grosse part */}
          {(() => {
            const top = [...slices].sort((x, y) => y.amount - x.amount)[0];
            const pct = sideTotal > 0 ? Math.round((top.amount / sideTotal) * 100) : 0;
            return (
              <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-3 text-[14px] text-slate-700 leading-snug">
                <b className="text-slate-900">{top.name}</b> {side === 'income' ? 'représente' : 'prend'} <b className="text-slate-900">{pct}&nbsp;%</b> de tes {side === 'income' ? 'revenus' : 'dépenses'}
                {pct >= 50 ? ', plus de la moitié.' : pct >= 33 ? ', environ un tiers.' : '.'}
              </p>
            );
          })()}
        </>
      )}
    </div>
  );

  // ---------- Ordinateur : chiffres clés en haut, catégories en grand dessous ----------
  if (desktop) {
    const kpi = 'bg-white rounded-3xl border border-slate-100 p-6';
    return (
      <div className="max-w-6xl animate-screen">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-full max-w-md"><PeriodBar value={period} onChange={setPeriod} /></div>
          <div className="ml-auto">{shareBtn}</div>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4 items-start">
          <div className={kpi}>
            <div className="text-sm font-bold text-slate-900">Solde</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-900 mb-4">{money(report.current)}</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">À l'ouverture</span>
                <span className="font-semibold tabular-nums text-slate-900">{money(report.opening)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">En fin de période</span>
                <span className="font-semibold tabular-nums text-slate-900">{money(report.closing)}</span>
              </div>
              <div className="flex justify-between gap-2 border-t border-slate-100 pt-2 mt-2">
                <span className="text-slate-500">Différence</span>
                <span className={`font-extrabold tabular-nums ${change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {change >= 0 ? '+' : '−'}
                  {money(Math.abs(change))}
                </span>
              </div>
            </div>
          </div>
          <div className="col-span-2">{netCard}</div>
        </div>
        {categoryCard}
        <div className="mt-4 max-w-xl">{tools}</div>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-50 px-5 pt-3 pb-28 animate-screen">
      {/* En-tête : portefeuille + solde */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 shrink-0">
          {onBack && (
            <button onClick={onBack} aria-label="Retour" className="w-10 h-10 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Rapport</h1>
        </div>
        {/* Le nom du portefeuille se coupe (…) plutôt que d'élargir l'écran */}
        <div className="flex items-center gap-2 min-w-0">
        {shareBtn}
        <button
          onClick={onOpenAccountPicker}
          className="min-w-0 inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-white border border-slate-100 hover:bg-slate-100 cursor-pointer"
        >
          <WalletChipIcon wallet={activeWallet} />
          {/* Sur téléphone la place manque : « Tous » suffit, l'icône dit le reste */}
          <span className="text-xs font-semibold text-slate-700 min-w-0 max-w-[140px] truncate">{activeWallet ? activeWalletLabel : 'Tous'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        </button>
        </div>
      </div>
      <div className="text-center mb-3">
        <div className="text-xs font-medium text-slate-500">Solde</div>
        <div className="text-2xl font-extrabold tabular-nums text-slate-900">{money(report.current)}</div>
      </div>

      {/* Reste en haut de l'écran quand on descend dans le rapport */}
      <div className="sticky top-[env(safe-area-inset-top)] z-20 -mx-5 px-5 pt-2 bg-slate-50">
        <PeriodBar value={period} onChange={setPeriod} />
      </div>

      <div className="py-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Solde à l'ouverture</span>
          <span className="font-semibold tabular-nums text-slate-900">{money(report.opening)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Solde de fin</span>
          <span className="font-semibold tabular-nums text-slate-900">{money(report.closing)}</span>
        </div>
        {/* Ce qui a changé sur la période (fin − ouverture) */}
        <div className="ml-auto w-1/2 border-t border-slate-200 !mt-2.5 pt-2.5 text-right">
          <span className={`font-extrabold tabular-nums ${report.closing - report.opening >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {report.closing - report.opening >= 0 ? '+' : '−'}
            {money(Math.abs(report.closing - report.opening))}
          </span>
        </div>
      </div>

      {netCard}

      {categoryCard}

      <div className="mt-3">{tools}</div>
    </div>
  );
};

// ---------- Anneau + légende (la légende sert aussi de tableau des valeurs) ----------
const CategoryDonut: React.FC<{
  slices: Slice[];
  total: number;
  money: (v: number) => string;
  onSelectTransaction: (tx: Transaction) => void;
  wide?: boolean; // ordinateur : anneau à gauche, légende à droite
}> = ({ slices, total, money, onSelectTransaction, wide }) => {
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const R = 44;
  const C = 2 * Math.PI * R;
  const GAP = slices.length > 1 ? 2 : 0; // 2 px de fond entre deux parts
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const focus = slices.find((s) => s.key === active);

  let acc = 0;
  return (
    <div className={wide ? 'grid grid-cols-[280px_minmax(0,1fr)] gap-10 items-start' : ''}>
      <div className={wide ? 'sticky top-6 flex justify-center' : 'flex justify-center mb-4'}>
        <svg viewBox="0 0 120 120" className={`${wide ? 'w-64 h-64' : 'w-44 h-44'} -rotate-90 animate-donut`} role="img" aria-label="Répartition par catégorie">
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
                className="cursor-pointer transition-[stroke-width,opacity] duration-200"
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
            <text x="60" y="70" textAnchor="middle" className="fill-slate-900 font-bold" style={{ fontSize: centerSize(focus ? `${pct(focus.amount).toFixed(0)} %` : money(total)) }}>
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
                <div className="text-[12px] text-slate-500 truncate">
                  {s.txs.length} transaction{s.txs.length > 1 ? 's' : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold tabular-nums text-slate-900 whitespace-nowrap">{money(s.amount)}</div>
                <div className="text-[12px] tabular-nums text-slate-500">{pct(s.amount).toFixed(1)} %</div>
              </div>
              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${open === s.key ? 'rotate-90' : ''}`} />
            </button>
            {open === s.key && (
              <div className="pl-2 pb-2 animate-fade-in">
                {hasSubs(s) ? (
                  <SubList parent={s} money={money} onSelectTransaction={onSelectTransaction} />
                ) : (
                  <TxList txs={s.txs} onSelectTransaction={onSelectTransaction} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Texte au centre de l'anneau : assez petit pour tenir dans le trou (≈ 64 unités de large)
const centerSize = (text: string) => `${Math.min(11, 64 / (text.length * 0.6)).toFixed(2)}px`;

// Une catégorie a des sous-catégories à montrer si ses opérations ne sont pas toutes « à elle »
const hasSubs = (s: Slice) => s.subs.length > 1 || (s.subs.length === 1 && !s.subs[0].key.endsWith(':self'));

const TxList: React.FC<{ txs: Transaction[]; onSelectTransaction: (tx: Transaction) => void }> = ({ txs, onSelectTransaction }) => (
  <>
    {[...txs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => (
        <TransactionItem key={t.id} transaction={t} onClick={onSelectTransaction} />
      ))}
  </>
);

// Sous-catégories d'un parent : part de chacune (barre) ; on touche pour voir ses transactions
const SubList: React.FC<{ parent: Slice; money: (v: number) => string; onSelectTransaction: (tx: Transaction) => void }> = ({
  parent,
  money,
  onSelectTransaction,
}) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="border-l-2 pl-2 ml-3.5 space-y-0.5" style={{ borderColor: parent.color + '55' }}>
      {parent.subs.map((sub) => {
        const share = parent.amount > 0 ? (sub.amount / parent.amount) * 100 : 0;
        return (
          <div key={sub.key}>
            <button
              onClick={() => setOpen(open === sub.key ? null : sub.key)}
              aria-expanded={open === sub.key}
              className="w-full flex items-center gap-2.5 py-2 text-left cursor-pointer rounded-xl hover:bg-slate-50"
            >
              <IconBadge icon={sub.icon} image={sub.image} color={sub.color} size="xs" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-slate-800 truncate">{sub.name}</span>
                  <span className="text-[13px] font-bold tabular-nums text-slate-900 shrink-0">{money(sub.amount)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full animate-bar tint-bg" style={{ width: `${share}%`, '--tint': parent.color } as React.CSSProperties} />
                  </div>
                  <span className="text-[12px] tabular-nums text-slate-500 w-20 text-right shrink-0">
                    {share.toFixed(0)} % · {sub.txs.length}
                  </span>
                </div>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open === sub.key ? 'rotate-90' : ''}`} />
            </button>
            {open === sub.key && (
              <div className="pb-1 animate-fade-in">
                <TxList txs={sub.txs} onSelectTransaction={onSelectTransaction} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
