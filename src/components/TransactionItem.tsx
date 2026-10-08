import React from 'react';
import { Transaction } from '../types';
import { IconBadge } from './AppIcon';
import { formatMoney } from '../lib/money';

interface TransactionItemProps {
  transaction: Transaction;
  onClick: (tx: Transaction) => void;
  showDate?: boolean; // false dans les listes déjà groupées par jour (le jour est dans le titre du groupe)
}

// Date courte sous le titre : « Aujourd'hui », « Hier », « 28 sept. » (l'heure n'est plus affichée)
function shortDay(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

const KIND_LABEL: Record<string, string> = { receive: 'Revenu', send: 'Dépense', payment: 'Paiement', transfer: 'Transfert', adjustment: 'Correction' };
const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Le titre et la catégorie disent la même chose (l'un contient l'autre)
const sameWords = (title: string, category: string) => {
  const a = plain(title);
  const b = plain(category);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
};

export const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  onClick,
  showDate = true,
}) => {
  const isPositive = transaction.amount > 0;
  const formattedAmount = `${isPositive ? '+' : '−'}${formatMoney(Math.abs(transaction.amount), transaction.currency)}`;

  // Sous le montant : la catégorie, toujours affichée. Si elle répète le titre (« Apple Music » / « Apple Music »),
  // on met une autre raison à la place : la personne concernée, sinon le genre d'opération.
  const typeLabel = sameWords(transaction.title, transaction.category)
    ? transaction.withPerson?.trim() || KIND_LABEL[transaction.type] || (isPositive ? 'Revenu' : 'Dépense')
    : transaction.category;

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
          {showDate && <span className="text-xs text-slate-400 font-medium block mt-0.5">{shortDay(transaction.createdAt)}</span>}
        </div>
      </div>

      {/* Right: Amount & Type */}
      <div className="text-right shrink-0 pl-2">
        <span
          className={`text-sm font-bold tracking-tight block tabular-nums ${
            isPositive ? 'text-emerald-600' : 'text-red-500'
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
