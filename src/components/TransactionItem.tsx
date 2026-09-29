import React from 'react';
import { Transaction } from '../types';
import { IconBadge } from './AppIcon';
import { formatMoney, timeLabel } from '../lib/money';

interface TransactionItemProps {
  transaction: Transaction;
  onClick: (tx: Transaction) => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  onClick,
}) => {
  const isPositive = transaction.amount > 0;
  const formattedAmount = `${isPositive ? '+' : '−'}${formatMoney(Math.abs(transaction.amount), transaction.currency)}`;

  // Sous le montant : la catégorie
  const typeLabel = transaction.category;

  return (
    <div
      onClick={() => onClick(transaction)}
      className="flex items-center justify-between py-2.5 px-1 hover:bg-slate-50/80 active:bg-slate-100 rounded-xl transition duration-150 cursor-pointer"
    >
      {/* Left: Avatar & Info */}
      <div className="flex items-center gap-3.5 min-w-0">
        <IconBadge
          icon={transaction.avatarType === 'icon' ? transaction.avatarValue : ''}
          image={transaction.avatarType === 'image' ? transaction.avatarValue : undefined}
          color={transaction.color}
        />

        {/* Text */}
        <div className="truncate">
          <span className="text-sm font-bold text-slate-900 tracking-tight block truncate">
            {transaction.title}
          </span>
          <span className="text-xs text-slate-400 font-medium block mt-0.5">
            {timeLabel(transaction.createdAt)}
          </span>
        </div>
      </div>

      {/* Right: Amount & Type */}
      <div className="text-right shrink-0 pl-2">
        <span
          className={`text-sm font-bold tracking-tight block tabular-nums ${
            isPositive ? 'text-emerald-600' : 'text-slate-900'
          }`}
        >
          {formattedAmount}
        </span>
        <span className="text-xs text-slate-400 font-medium block mt-0.5 max-w-[120px] truncate">
          {typeLabel}
        </span>
      </div>
    </div>
  );
};
