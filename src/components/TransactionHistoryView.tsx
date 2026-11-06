import React, { useState, useMemo, useDeferredValue } from 'react';
import { ArrowLeft, Search, X, Loader2, Layers, ChevronDown, ChevronRight, BarChart2, CalendarClock } from 'lucide-react';
import { Recurring, Settings, Transaction, Wallet } from '../types';
import type { Category } from '../data/categories';
import { occurrencesBetween, ymd } from '../lib/recurring';
import { IconBadge, WalletChipIcon } from './AppIcon';
import { TransactionItem } from './TransactionItem';
import { SecretAmount, SecretMoney } from './MatrixSwap';
import { PeriodBar } from './PeriodBar';
import { countsInReport, fitAmount, formatMoney, toMain } from '../lib/money';
import { inPeriod, Period, periodRange } from '../lib/periods';
import { haptic } from '../lib/haptics';
import { periodBalances, reportScope } from '../lib/report';
import { useDisplayPrefs } from '../lib/display';
import { MatrixSwap } from './MatrixSwap';
import { useIsDesktop } from '../hooks/useIsDesktop';

interface TransactionHistoryViewProps {
  transactions: Transaction[]; // toutes les transactions
  wallets: Wallet[];
  initialWalletId: string; // 'all' ou le portefeuille choisi sur l'accueil
  settings: Settings;
  onBack?: () => void; // absent : c'est l'onglet « Transactions » (pas de retour)
  onSelectTransaction: (tx: Transaction) => void;
  // Onglet « Transactions » : portefeuille choisi pour toute l'app (comme le Rapport) + lien vers le Rapport
  activeWallet?: Wallet | null;
  activeWalletLabel?: string;
  onOpenAccountPicker?: () => void;
  onOpenReport?: (period: Period) => void;
  // Onglet « Futur » : échéances prévues (factures, abonnements…) en plus des opérations datées plus tard
  recurrings?: Recurring[];
  categories?: Category[];
  onOpenUpcoming?: () => void;
}

// Jours à venir montrés dans « Futur » pour les échéances qui reviennent
const FUTURE_DAYS = 90;
const REC_PREFIX = 'prevu:';

// Titre d'un jour : « Aujourd'hui », « Hier », « Demain », sinon « jeudi 24 septembre » (+ l'année si ce n'est pas celle-ci)
function dayTitle(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  if (diff === -1) return 'Demain';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

type FilterType = 'Toutes' | 'Revenus' | 'Dépenses';

export const TransactionHistoryView: React.FC<TransactionHistoryViewProps> = ({
  transactions,
  wallets,
  initialWalletId,
  settings,
  onBack,
  onSelectTransaction,
  activeWallet,
  activeWalletLabel,
  onOpenAccountPicker,
  onOpenReport,
  recurrings = [],
  categories = [],
  onOpenUpcoming,
}) => {
  const isTab = !!onOpenAccountPicker;
  const desktop = useIsDesktop(); // ordinateur : filtres à gauche, liste à droite
  const [period, setPeriod] = useState<Period>({ kind: 'month', offset: 0 });
  const [activeFilter, setActiveFilter] = useState<FilterType>('Toutes');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [localWalletId, setWalletId] = useState(initialWalletId);
  const walletId = isTab ? activeWallet?.id ?? 'all' : localWalletId;
  const { hideBalance } = useDisplayPrefs();
  // La saisie reste fluide : la liste suit un instant après (et la loupe tourne pendant ce temps)
  const query = useDeferredValue(searchQuery);
  const searching = query !== searchQuery;
  const walletChoices = wallets.filter((w) => !w.archived || w.id === walletId);

  const filters: FilterType[] = ['Toutes', 'Revenus', 'Dépenses'];

  // Filter & search logic
  // Onglet, « Tous » : les portefeuilles comptés dans le total (comme le solde affiché)
  const scope = useMemo(() => reportScope(wallets, isTab ? activeWallet ?? null : null), [wallets, isTab, activeWallet]);
  const future = period.offset > 0;
  const searchOn = !!query.trim();
  const tomorrow = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  }, []);
  const filteredTransactions = useMemo(() => {
    // Recherche : dans toutes les dates ; « Futur » : à partir de demain
    const range = searchOn ? { start: null, end: null } : future ? { start: tomorrow, end: null } : periodRange(period);
    const inScope = new Set(scope.map((w) => w.id));
    return transactions.filter((tx) => {
      if (walletId !== 'all' && tx.walletId !== walletId) return false;
      if (isTab && !inScope.has(tx.walletId)) return false;
      if (!inPeriod(tx.createdAt, range)) return false;
      // Filter by type
      if (activeFilter === 'Revenus' && tx.amount <= 0) return false;
      if (activeFilter === 'Dépenses' && tx.amount >= 0) return false;

      // Filter by search query
      if (query.trim()) {
        const q = query.toLowerCase();
        const matchesTitle = tx.title.toLowerCase().includes(q);
        const matchesCat = tx.category.toLowerCase().includes(q);
        const matchesAmount = tx.amount.toString().includes(q);
        const matchesPerson = !!tx.withPerson?.toLowerCase().includes(q);
        return matchesTitle || matchesCat || matchesAmount || matchesPerson;
      }

      return true;
    });
  }, [transactions, activeFilter, query, period, walletId, isTab, scope, searchOn, future, tomorrow]);

  // « Futur » : les prochaines échéances des opérations qui reviennent (pas encore des opérations)
  const planned = useMemo(() => {
    if (!future || searchOn) return [];
    const inScope = new Set(scope.map((w) => w.id));
    const from = ymd(tomorrow);
    const to = ymd(new Date(tomorrow.getTime() + FUTURE_DAYS * 86400000));
    const out: Transaction[] = [];
    for (const r of recurrings) {
      if (!r.active) continue;
      if (walletId !== 'all' && r.walletId !== walletId) continue;
      if (isTab && !inScope.has(r.walletId)) continue;
      if (activeFilter === 'Revenus' && r.direction !== 'in') continue;
      if (activeFilter === 'Dépenses' && r.direction !== 'out') continue;
      const cat = categories.find((c) => c.id === r.categoryId);
      for (const day of occurrencesBetween(r, from, to)) {
        out.push({
          id: `${REC_PREFIX}${r.id}:${day}`,
          title: r.title,
          createdAt: `${day}T12:00:00`,
          amount: (r.direction === 'out' ? -1 : 1) * (r.amount ?? 0),
          currency: r.currency,
          walletId: r.walletId,
          type: r.direction === 'out' ? 'send' : 'receive',
          category: cat?.name ?? (r.direction === 'out' ? 'Dépense' : 'Revenu'),
          categoryId: r.categoryId,
          avatarType: cat?.image ? 'image' : 'icon',
          avatarValue: cat?.image ?? cat?.icon ?? 'CalendarClock',
          color: cat?.color ?? '#64748B',
        });
      }
    }
    return out;
  }, [future, searchOn, tomorrow, recurrings, categories, walletId, isTab, scope, activeFilter]);
  const plannedOf = (t: Transaction) => t.id.startsWith(REC_PREFIX);
  const amountKnown = (t: Transaction) => !plannedOf(t) || t.amount !== 0;

  // Group by date
  const groupedTransactions = useMemo(() => {
    const groups: { [key: string]: Transaction[] } = {};
    // Futur : le plus proche d'abord ; sinon le plus récent d'abord
    const all = [...filteredTransactions, ...planned].sort((a, b) => (future && !searchOn ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
    all.forEach((tx) => {
      const key = dayTitle(tx.createdAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });
    return groups;
  }, [filteredTransactions, planned, future, searchOn]);

  // Vue du total : un transfert vers un portefeuille exclu du total est une vraie sortie
  const totalIds = useMemo(() => {
    if (isTab ? activeWallet : walletId !== 'all') return null;
    return new Set(reportScope(wallets, null).map((w) => w.id));
  }, [isTab, activeWallet, walletId, wallets]);
  const counts = (t: Transaction) => countsInReport(t, totalIds);

  // Totaux de la période (hors transferts internes et ajustements), en devise principale
  const main = settings.mainCurrency;
  const counted = [...filteredTransactions, ...planned].filter(counts);
  const totalIn = counted.filter((t) => t.amount > 0).reduce((s, t) => s + toMain(t.amount, t.currency, settings), 0);
  const totalOut = counted.filter((t) => t.amount < 0).reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const balances = useMemo(
    () => (isTab && !future && !searchOn ? periodBalances(transactions, scope, period, settings) : null),
    [isTab, transactions, scope, period, settings, future, searchOn]
  );
  const currentBalance = useMemo(() => (isTab ? periodBalances(transactions, scope, { kind: 'all', offset: 0 }, settings).current : null), [isTab, transactions, scope, settings]);
  // Solde à la fin d'aujourd'hui (sans les opérations datées plus tard) : point de départ du « Solde prévu »
  const todayBalance = useMemo(() => {
    if (!isTab) return null;
    const ids = new Set(scope.map((w) => w.id));
    const initial = scope.reduce((s, w) => s + toMain(w.initialBalance, w.currency, settings), 0);
    return transactions.reduce((s, t) => (ids.has(t.walletId) && new Date(t.createdAt) < tomorrow ? s + toMain(t.amount, t.currency, settings) : s), initial);
  }, [isTab, scope, transactions, settings, tomorrow]);
  // Total d'un jour (hors transferts entre portefeuilles du total), en devise principale
  const dayTotal = (items: Transaction[]) => items.filter((t) => t.type !== 'transfer' || counts(t)).reduce((s, t) => s + toMain(t.amount, t.currency, settings), 0);
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${formatMoney(Math.abs(v), main)}`;

  // Morceaux communs aux mises en page téléphone et ordinateur
  const balanceBox = balances && (
      <div className="mt-3 rounded-2xl bg-white border border-slate-100 overflow-hidden">
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-slate-500">Solde de fin</span>
            {onOpenReport && (
              <button
                onClick={() => onOpenReport(period)}
                aria-label="Voir le rapport de cette période"
                className="h-8 pl-2.5 pr-2 rounded-full bg-emerald-500/10 flex items-center gap-1 text-[13px] font-bold text-emerald-600 cursor-pointer active:scale-95 transition"
              >
                <BarChart2 className="w-3.5 h-3.5" /> Voir le rapport <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 mt-0.5">
            <span className="text-[24px] font-extrabold tabular-nums tracking-tight text-slate-900 whitespace-nowrap"><SecretMoney text={formatMoney(balances.closing, main)} /></span>
            <span className={`text-[15px] font-bold tabular-nums whitespace-nowrap ${balances.closing - balances.opening >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              <SecretMoney text={signed(balances.closing - balances.opening)} />
            </span>
          </div>
          <div className="text-[12px] text-slate-400 mt-0.5 tabular-nums">Ouverture : <SecretMoney text={formatMoney(balances.opening, main)} /></div>
        </div>
        {/* Entrées et sorties dans la même carte */}
        <div className="grid grid-cols-2 border-t border-slate-100 divide-x divide-slate-100">
          <div className="min-w-0 px-4 py-2.5">
            <div className="text-[12px] font-semibold text-slate-500">Entrées</div>
            <div className="text-[15px] font-bold tabular-nums whitespace-nowrap text-emerald-600"><SecretAmount text={`+${formatMoney(totalIn, main)}`} /></div>
          </div>
          <div className="min-w-0 px-4 py-2.5">
            <div className="text-[12px] font-semibold text-slate-500">Sorties</div>
            <div className="text-[15px] font-bold tabular-nums whitespace-nowrap text-red-500"><SecretAmount text={`−${formatMoney(totalOut, main)}`} /></div>
          </div>
        </div>
      </div>
    );
  const totalsRow = (
      <div className="flex gap-2 mt-3">
        <div className="flex-1 min-w-0 px-3 py-2 rounded-2xl bg-white border border-slate-100">
          <div className="text-[12px] font-semibold text-slate-500">Entrées</div>
          <div className={`${fitAmount(`+${formatMoney(totalIn, main)}`)} font-bold tabular-nums whitespace-nowrap text-emerald-600`}><SecretAmount text={`+${formatMoney(totalIn, main)}`} /></div>
        </div>
        <div className="flex-1 min-w-0 px-3 py-2 rounded-2xl bg-white border border-slate-100">
          <div className="text-[12px] font-semibold text-slate-500">Sorties</div>
          <div className={`${fitAmount(`−${formatMoney(totalOut, main)}`)} font-bold tabular-nums whitespace-nowrap text-red-500`}><SecretAmount text={`−${formatMoney(totalOut, main)}`} /></div>
        </div>
      </div>
  );
  // Recherche : le nombre de résultats, puis revenus, dépenses et le total (comme Money Lover)
  const net = totalIn - totalOut;
  const searchSummary = searchOn && (
    <div className={`${desktop ? '' : 'mt-3'} rounded-2xl bg-white border border-slate-100 px-4 py-3 animate-fade-in`} key={`s-${query}`}>
      <div className="text-[14px] font-bold text-slate-900">
        {filteredTransactions.length} résultat{filteredTransactions.length > 1 ? 's' : ''}
      </div>
      <div className="mt-2 space-y-1 text-[13px] tabular-nums">
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Revenus</span>
          <span className="font-semibold text-emerald-600 whitespace-nowrap"><SecretAmount text={`+${formatMoney(totalIn, main)}`} /></span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Dépenses</span>
          <span className="font-semibold text-red-500 whitespace-nowrap"><SecretAmount text={`−${formatMoney(totalOut, main)}`} /></span>
        </div>
      </div>
      <div className="flex justify-end mt-2 pt-2 border-t border-slate-100">
        <span className={`text-[15px] font-extrabold tabular-nums whitespace-nowrap ${net >= 0 ? 'text-slate-900' : 'text-red-500'}`}><SecretAmount text={signed(net)} /></span>
      </div>
    </div>
  );
  // Futur : ce qui est prévu, et le solde si tout se passe comme prévu
  const plannedCount = planned.length;
  const futureBox = future && !searchOn && (
    <div className="mt-3 rounded-2xl bg-white border border-slate-100 overflow-hidden">
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-slate-500">{todayBalance !== null ? 'Solde prévu' : 'Prévu'}</span>
          {onOpenUpcoming && (
            <button
              onClick={onOpenUpcoming}
              className="h-8 pl-2.5 pr-2 rounded-full bg-emerald-500/10 flex items-center gap-1 text-[13px] font-bold text-emerald-600 cursor-pointer active:scale-95 transition"
            >
              <CalendarClock className="w-3.5 h-3.5" /> À venir <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {todayBalance !== null && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 mt-0.5">
            <span className="text-[24px] font-extrabold tabular-nums tracking-tight text-slate-900 whitespace-nowrap">
              <SecretMoney text={formatMoney(todayBalance + net, main)} />
            </span>
            <span className={`text-[15px] font-bold tabular-nums whitespace-nowrap ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}><SecretMoney text={signed(net)} /></span>
          </div>
        )}
        <div className="text-[12px] text-slate-400 mt-0.5">
          {plannedCount > 0 ? `Avec les factures et opérations qui reviennent (${FUTURE_DAYS} prochains jours).` : 'Les opérations datées après aujourd\'hui.'}
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-slate-100 divide-x divide-slate-100">
        <div className="min-w-0 px-4 py-2.5">
          <div className="text-[12px] font-semibold text-slate-500">Entrées prévues</div>
          <div className="text-[15px] font-bold tabular-nums whitespace-nowrap text-emerald-600"><SecretAmount text={`+${formatMoney(totalIn, main)}`} /></div>
        </div>
        <div className="min-w-0 px-4 py-2.5">
          <div className="text-[12px] font-semibold text-slate-500">Sorties prévues</div>
          <div className="text-[15px] font-bold tabular-nums whitespace-nowrap text-red-500"><SecretAmount text={`−${formatMoney(totalOut, main)}`} /></div>
        </div>
      </div>
    </div>
  );
  const summaryBox = searchSummary || futureBox || balanceBox || totalsRow;
  const dayList = Object.keys(groupedTransactions).length === 0 ? (
      <div className="py-16 text-center text-slate-400">
        <p className="text-sm font-medium">{searchOn ? `Rien trouvé pour « ${query.trim()} »` : future ? 'Rien de prévu pour l\'instant' : 'Aucune transaction sur cette période'}</p>
        <p className="text-xs mt-1">{searchOn ? 'Essaie un autre mot, une catégorie ou un montant' : future ? 'Ajoute une facture ou un abonnement dans « À venir »' : 'Change la période, le filtre ou la recherche'}</p>
      </div>
    ) : (
      Object.entries(groupedTransactions).map(([dateGroup, items]) => (
        <div key={dateGroup} className="cv-auto">
          {/* Date Group Heading */}
          <div className="flex items-baseline justify-between gap-2 mb-2 px-1">
            <span className="text-[12px] font-bold text-slate-400 tracking-wider uppercase">{dateGroup}</span>
            {!searchOn && (
              <span className={`text-xs font-bold tabular-nums ${dayTotal(items) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}><SecretAmount text={signed(dayTotal(items))} /></span>
            )}
          </div>

          {/* Transactions in this date group */}
          <div className="bg-white rounded-2xl p-2 shadow-2xs border border-slate-100 space-y-0.5">
            {items.map((tx) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                onClick={plannedOf(tx) ? () => onOpenUpcoming?.() : onSelectTransaction}
                showDate={false}
                badge={plannedOf(tx) ? 'Prévu' : undefined}
                amountText={amountKnown(tx) ? undefined : 'À saisir'}
              />
            ))}
          </div>
        </div>
      ))
    );

  // Recherche : champ toujours visible sur ordinateur
  const searchInput = (
    <div className="relative flex items-center">
      {searching ? (
        <Loader2 className="w-4 h-4 text-slate-500 absolute left-3.5 animate-spin" />
      ) : (
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5" />
      )}
      <input
        type="text"
        placeholder="Rechercher un titre, une catégorie, un montant"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent text-slate-800 placeholder-slate-400"
        autoFocus={!desktop}
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery('')}
          aria-label="Effacer la recherche"
          className="absolute right-3 p-1 rounded-full hover:bg-slate-100 animate-fade-in"
        >
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>
      )}
    </div>
  );

  if (desktop) {
    const walletBtn = (w: Wallet | { id: 'all'; name: string }) => {
      const on = walletId === w.id;
      return (
        <button
          key={w.id}
          onClick={() => setWalletId(w.id)}
          aria-pressed={on}
          className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
            on ? 'bg-accent text-slate-900 border-transparent' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
        >
          {'icon' in w ? (
            <IconBadge icon={w.icon} image={w.image} color={w.color} size="xs" />
          ) : (
            <span className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-slate-900" />
            </span>
          )}
          {w.name}
        </button>
      );
    };
    return (
      <div className="max-w-6xl animate-screen">
        {onBack && (
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={onBack}
              aria-label="Retour"
              className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="text-lg font-bold text-slate-900">Historique</h2>
          </div>
        )}
        <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
          {/* Filtres, collés en haut pendant qu'on fait défiler la liste */}
          <aside className="sticky top-6 space-y-4">
            {searchInput}
            {currentBalance !== null && (
              <div className="px-4 py-3 rounded-2xl bg-white border border-slate-100">
                <div className="text-xs font-medium text-slate-500">Solde</div>
                <div className="text-2xl font-extrabold tabular-nums text-slate-900"><MatrixSwap hidden={hideBalance} text={formatMoney(currentBalance, main)} /></div>
              </div>
            )}
            <div>
              {!searchOn && <PeriodBar value={period} onChange={setPeriod} future />}
              {summaryBox}
            </div>
            <div className="flex gap-2">
              {filters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`flex-1 py-2 rounded-full text-xs font-bold transition cursor-pointer ${
                    activeFilter === filter ? 'bg-accent text-slate-900' : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            {!isTab && walletChoices.length > 1 && (
              <div>
                <div className="text-[12px] font-bold text-slate-400 tracking-wider uppercase mb-2 px-1">Portefeuilles</div>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: 'all', name: 'Tous' } as const, ...walletChoices].map(walletBtn)}
                </div>
              </div>
            )}
          </aside>

          {/* Liste */}
          <div className="min-w-0">
            <div key={`${query}|${walletId}|${activeFilter}|${period.kind}${period.offset}`} className={`space-y-5 animate-list-in transition-opacity ${searching ? 'opacity-60' : ''}`}>
              {dayList}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-50 pb-24">
      {/* Top Bar */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-2 sticky top-[env(safe-area-inset-top)] bg-slate-50 z-30">
        {isTab ? (
          <>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight shrink-0">Transactions</h1>
            <button
              onClick={onOpenAccountPicker}
              className="ml-auto min-w-0 inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-white border border-slate-100 hover:bg-slate-100 cursor-pointer"
            >
              <WalletChipIcon wallet={activeWallet ?? null} />
              <span className="text-xs font-semibold text-slate-700 min-w-0 truncate">{activeWalletLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onBack}
              aria-label="Retour"
              className="w-11 h-11 rounded-full bg-white shadow-xs border border-slate-100 flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-95 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-slate-800" />
            </button>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Historique</h1>
          </>
        )}

        <button
          onClick={() => setShowSearch(!showSearch)}
          aria-label="Rechercher"
          className={`w-11 h-11 shrink-0 rounded-full shadow-xs border flex items-center justify-center active:scale-95 transition cursor-pointer ${
            showSearch
              ? 'bg-accent border-transparent text-slate-900'
              : 'bg-white border-slate-100 text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Expandable Search Input */}
      {showSearch && (
        <div className="px-5 pt-2 pb-1 animate-search-in">
          <div className="relative flex items-center">
            {searching ? (
              <Loader2 className="w-4 h-4 text-slate-500 absolute left-3.5 animate-spin" />
            ) : (
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5" />
            )}
            <input
              type="text"
              placeholder="Rechercher un titre, une catégorie, un montant"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent text-slate-800 placeholder-slate-400"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Effacer la recherche"
                className="absolute right-3 p-1 rounded-full hover:bg-slate-100 animate-fade-in"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Portefeuille */}
      {/* Solde actuel (onglet) */}
      {currentBalance !== null && !searchOn && (
        <div className="text-center pt-2">
          <div className="text-xs font-medium text-slate-500">Solde</div>
          <div className="text-2xl font-extrabold tabular-nums text-slate-900"><MatrixSwap hidden={hideBalance} text={formatMoney(currentBalance, main)} /></div>
        </div>
      )}

      {!isTab && walletChoices.length > 1 && (
        <div className="px-5 pt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
          {[{ id: 'all', name: 'Tous' } as const, ...walletChoices].map((w) => {
            const on = walletId === w.id;
            return (
              <button
                key={w.id}
                onClick={() => { haptic(); setWalletId(w.id); }}
                aria-pressed={on}
                className={`shrink-0 flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
                  on ? 'bg-accent text-slate-900 border-transparent' : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                {'icon' in w ? (
                  <IconBadge icon={w.icon} image={w.image} color={w.color} size="xs" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                    <Layers className="w-3.5 h-3.5 text-slate-900" />
                  </span>
                )}
                {w.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Période */}
      <div className="px-5 pt-3">
        {!searchOn && <PeriodBar value={period} onChange={setPeriod} future />}
        {/* Ouverture, fin, différence + lien vers le Rapport (recherche : résultats et totaux ; Futur : ce qui est prévu) */}
        {summaryBox}
      </div>

      {/* Filter Tabs */}
      <div className="px-5 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
        {filters.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <button
              key={filter}
              onClick={() => { haptic(); setActiveFilter(filter); }}
              className={`px-5 py-2 rounded-full text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-accent text-slate-900 shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              {filter}
            </button>
          );
        })}
      </div>

      {/* Liste par jour : fondu léger à chaque nouvelle recherche ou filtre */}
      <div key={`${query}|${walletId}|${activeFilter}|${period.kind}${period.offset}`} className={`px-5 pt-2 space-y-5 animate-list-in transition-opacity ${searching ? 'opacity-60' : ''}`}>
        {dayList}
      </div>
    </div>
  );
};
