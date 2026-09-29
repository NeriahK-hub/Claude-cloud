import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Transaction } from '../types';
import { TransactionItem } from './TransactionItem';


interface TransactionListProps {
  transactions: Transaction[];
  onSelectTransaction: (tx: Transaction) => void;
  onViewAll: () => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  onSelectTransaction,
  onViewAll,
}) => {
  // Les 6 dernières transactions sur l'accueil
  const latest = transactions.slice(0, 6);

  return (
    <div className="w-full px-5 pt-1 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-slate-900 tracking-tight">
          Dernières transactions
        </h2>
        <button
          onClick={onViewAll}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-0.5 transition cursor-pointer"
        >
          Tout voir
          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>

      {/* List */}
      {latest.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">Aucune transaction. Appuie sur + pour commencer.</p>
      )}
      <div className="space-y-0.5">
        {latest.map((tx) => (
          <TransactionItem
            key={tx.id}
            transaction={tx}
            onClick={onSelectTransaction}
          />
        ))}
      </div>
    </div>
  );
};
