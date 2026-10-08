import React, { useState, useMemo, useDeferredValue } from 'react';
import { ArrowLeft, Search, X, Loader2, Layers, ChevronDown, ChevronRight, BarChart2 } from 'lucide-react';
import { Settings, Transaction, Wallet } from '../types';
import { IconBadge, WalletChipIcon } from './AppIcon';
import { TransactionItem } from './TransactionItem';
import { SecretAmount, SecretMoney } from './MatrixSwap';
import { PeriodBar } from './PeriodBar';
import { countsInReport, dayLabel, fitAmount, formatMoney, toMain } from '../lib/money';
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
  const filteredTransactions = useMemo(() => {
    const range = periodRange(period);
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
        return matchesTitle || matchesCat || matchesAmount;
      }

      return true;
    });
  }, [transactions, activeFilter, query, period, walletId, isTab, scope]);

  // Group by date
  const groupedTransactions = useMemo(() => {
    const groups: { [key: string]: Transaction[] } = {};
    [...filteredTransactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach((tx) => {
      const key = dayLabel(tx.createdAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });
    return groups;
  }, [filteredTransactions]);

  // Vue du total : un transfert vers un portefeuille exclu du total est une vraie sortie
  const totalIds = useMemo(() => {
    if (isTab ? activeWallet : walletId !== 'all') return null;
    return new Set(reportScope(wallets, null).map((w) => w.id));
  }, [isTab, activeWallet, walletId, wallets]);
  const counts = (t: Transaction) => countsInReport(t, totalIds);

  // Totaux de la période (hors transferts internes et ajustements), en devise principale
  const main = settings.mainCurrency;
  const counted = filteredTransactions.filter(counts);
  const totalIn = counted.filter((t) => t.amount > 0).reduce((s, t) => s + toMain(t.amount, t.currency, settings), 0);
  const totalOut = counted.filter((t) => t.amount < 0).reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const balances = useMemo(() => (isTab ? periodBalances(transactions, scope, period, settings) : null), [isTab, transactions, scope, period, settings]);
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
                aria-label="Voir le détail de cette période"
                className="h-8 pl-2.5 pr-2 rounded-full bg-emerald-500/10 flex items-center gap-1 text-[13px] font-bold text-emerald-600 cursor-pointer active:scale-95 transition"
              >
                <BarChart2 className="w-3.5 h-3.5" /> Voir le détail <ChevronRight className="w-3.5 h-3.5" />
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
  const resultCount = query.trim() && (
      <p className={`${desktop ? 'mb-3' : 'px-5 pt-1'} text-xs font-semibold text-slate-500 animate-fade-in`} key={`n-${query}`}>
        {filteredTransactions.length} résultat{filteredTransactions.length > 1 ? 's' : ''} pour « {query.trim()} »
        {period.kind !== 'all' && (
          <>
            {' · '}
            <button onClick={() => setPeriod({ kind: 'all', offset: 0 })} className="font-bold text-emerald-700 cursor-pointer">
              Chercher dans toutes les périodes
            </button>
          </>
        )}
      </p>
    );
  const dayList = Object.keys(groupedTransactions).length === 0 ? (
      <div className="py-16 text-center text-slate-400">
        <p className="text-sm font-medium">Aucune transaction sur cette période</p>
        <p className="text-xs mt-1">Change la période, le filtre ou la recherche</p>
      </div>
    ) : (
      Object.entries(groupedTransactions).map(([dateGroup, items]) => (
        <div key={dateGroup} className="cv-auto">
          {/* Date Group Heading */}
          <div className="flex items-baseline justify-between gap-2 mb-2 px-1">
            <span className="text-[12px] font-bold text-slate-400 tracking-wider uppercase">{dateGroup}</span>
            <span className={`text-xs font-bold tabular-nums ${dayTotal(items) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}><SecretAmount text={signed(dayTotal(items))} /></span>
          </div>

          {/* Transactions in this date group */}
          <div className="bg-white rounded-2xl p-2 shadow-2xs border border-slate-100 space-y-0.5">
            {items.map((tx) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                onClick={onSelectTransaction}
                showDate={false}
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
            {balances && (
              <div className="px-4 py-3 rounded-2xl bg-white border border-slate-100">
                <div className="text-xs font-medium text-slate-500">Solde</div>
                <div className="text-2xl font-extrabold tabular-nums text-slate-900"><MatrixSwap hidden={hideBalance} text={formatMoney(balances.current, main)} /></div>
              </div>
            )}
            <div>
              <PeriodBar value={period} onChange={setPeriod} />
              {balanceBox ?? totalsRow}
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
            {resultCount}
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
      {balances && (
        <div className="text-center pt-2">
          <div className="text-xs font-medium text-slate-500">Solde</div>
          <div className="text-2xl font-extrabold tabular-nums text-slate-900"><MatrixSwap hidden={hideBalance} text={formatMoney(balances.current, main)} /></div>
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
        <PeriodBar value={period} onChange={setPeriod} />
        {/* Ouverture, fin, différence + lien vers le Rapport de la même période (comme Money Lover) */}
        {balanceBox ?? totalsRow}
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

      {resultCount}

      {/* Liste par jour : fondu léger à chaque nouvelle recherche ou filtre */}
      <div key={`${query}|${walletId}|${activeFilter}|${period.kind}${period.offset}`} className={`px-5 pt-2 space-y-5 animate-list-in transition-opacity ${searching ? 'opacity-60' : ''}`}>
        {dayList}
      </div>
    </div>
  );
};
