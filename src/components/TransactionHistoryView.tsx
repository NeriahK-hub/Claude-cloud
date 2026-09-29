import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { Settings, Transaction } from '../types';
import { TransactionItem } from './TransactionItem';
import { PeriodBar } from './PeriodBar';
import { countsInStats, dayLabel, formatMoney, toMain } from '../lib/money';
import { inPeriod, Period, periodRange } from '../lib/periods';

interface TransactionHistoryViewProps {
  transactions: Transaction[];
  settings: Settings;
  onBack: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}

type FilterType = 'Toutes' | 'Revenus' | 'Dépenses';

export const TransactionHistoryView: React.FC<TransactionHistoryViewProps> = ({
  transactions,
  settings,
  onBack,
  onSelectTransaction,
}) => {
  const [period, setPeriod] = useState<Period>({ kind: 'month', offset: 0 });
  const [activeFilter, setActiveFilter] = useState<FilterType>('Toutes');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearch, setShowSearch] = useState<boolean>(false);

  const filters: FilterType[] = ['Toutes', 'Revenus', 'Dépenses'];

  // Filter & search logic
  const filteredTransactions = useMemo(() => {
    const range = periodRange(period);
    return transactions.filter((tx) => {
      if (!inPeriod(tx.createdAt, range)) return false;
      // Filter by type
      if (activeFilter === 'Revenus' && tx.amount <= 0) return false;
      if (activeFilter === 'Dépenses' && tx.amount >= 0) return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = tx.title.toLowerCase().includes(query);
        const matchesCat = tx.category.toLowerCase().includes(query);
        const matchesAmount = tx.amount.toString().includes(query);
        return matchesTitle || matchesCat || matchesAmount;
      }

      return true;
    });
  }, [transactions, activeFilter, searchQuery, period]);

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

  // Totaux de la période (hors transferts et ajustements), en devise principale
  const main = settings.mainCurrency;
  const counted = filteredTransactions.filter(countsInStats);
  const totalIn = counted.filter((t) => t.amount > 0).reduce((s, t) => s + toMain(t.amount, t.currency, settings), 0);
  const totalOut = counted.filter((t) => t.amount < 0).reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);

  return (
    <div className="w-full min-h-screen bg-slate-50 pb-24">
      {/* Top Bar */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between sticky top-0 bg-slate-50/90 backdrop-blur-md z-30">
        <button
          onClick={onBack}
          aria-label="Retour"
          className="w-11 h-11 rounded-full bg-white shadow-xs border border-slate-100 flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-95 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-slate-800" />
        </button>

        <h1 className="text-lg font-bold text-slate-900 tracking-tight">
          Historique
        </h1>

        <button
          onClick={() => setShowSearch(!showSearch)}
          aria-label="Rechercher"
          className={`w-11 h-11 rounded-full shadow-xs border flex items-center justify-center active:scale-95 transition cursor-pointer ${
            showSearch
              ? 'bg-[#D8FB52] border-lime-300 text-slate-900'
              : 'bg-white border-slate-100 text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Expandable Search Input */}
      {showSearch && (
        <div className="px-5 pt-2 pb-1 animate-fade-in">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5" />
            <input
              type="text"
              placeholder="Rechercher un titre, une catégorie, un montant"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D8FB52] text-slate-800 placeholder-slate-400"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 p-1 rounded-full hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Période */}
      <div className="px-5 pt-3">
        <PeriodBar value={period} onChange={setPeriod} />
        <div className="flex gap-2 mt-3">
          <div className="flex-1 px-3 py-2 rounded-2xl bg-white border border-slate-100">
            <div className="text-[11px] font-semibold text-slate-500">Entrées</div>
            <div className="text-sm font-bold tabular-nums text-emerald-600">+{formatMoney(totalIn, main)}</div>
          </div>
          <div className="flex-1 px-3 py-2 rounded-2xl bg-white border border-slate-100">
            <div className="text-[11px] font-semibold text-slate-500">Sorties</div>
            <div className="text-sm font-bold tabular-nums text-slate-900">−{formatMoney(totalOut, main)}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-5 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
        {filters.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-5 py-2 rounded-full text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#D8FB52] text-slate-900 shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              {filter}
            </button>
          );
        })}
      </div>

      {/* Grouped Lists */}
      <div className="px-5 pt-2 space-y-5">
        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-medium">Aucune transaction sur cette période</p>
            <p className="text-xs mt-1">Change la période, le filtre ou la recherche</p>
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([dateGroup, items]) => (
            <div key={dateGroup}>
              {/* Date Group Heading */}
              <div className="text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-2 px-1">
                {dateGroup}
              </div>

              {/* Transactions in this date group */}
              <div className="bg-white rounded-2xl p-2 shadow-2xs border border-slate-100 space-y-0.5">
                {items.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    transaction={tx}
                    onClick={onSelectTransaction}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
