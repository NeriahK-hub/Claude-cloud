import React from 'react';
import { ArrowUpRight, ArrowDownLeft, PieChart, Users, ChevronDown } from 'lucide-react';
import { BalanceInfo, formatMoney } from '../lib/money';
import { useCountUp } from '../hooks/useCountUp';
import { Wallet } from '../types';
import { WalletChipIcon } from './AppIcon';

// Les 4 actions possibles depuis l'accueil
export type HomeAction = 'expense' | 'income' | 'budget' | 'ristourne';

interface BalanceSectionProps {
  balance: BalanceInfo;
  walletLabel: string;
  wallet: Wallet | null; // null = tous les portefeuilles
  onOpenAccountPicker: () => void;
  onActionClick: (action: HomeAction) => void;
}

// Liste des boutons : pour en changer un, il suffit de modifier cette liste
export const ACTIONS: {
  id: HomeAction;
  label: string;
  icon: React.ElementType;
  highlight?: boolean;
}[] = [
  { id: 'expense', label: 'Dépense', icon: ArrowUpRight, highlight: true },
  { id: 'income', label: 'Revenu', icon: ArrowDownLeft },
  { id: 'budget', label: 'Budget', icon: PieChart },
  { id: 'ristourne', label: 'Ristourne', icon: Users },
];

export const BalanceSection: React.FC<BalanceSectionProps> = ({
  balance,
  walletLabel,
  wallet,
  onOpenAccountPicker,
  onActionClick,
}) => {
  const shownMain = useCountUp(balance.main);
  const shownSecond = useCountUp(balance.second ?? 0);

  return (
    <div className="px-5 pt-3 pb-4 flex flex-col items-center text-center">
      {/* Choix du portefeuille (M-Pesa, Airtel Money, cash...) */}
      <button
        onClick={onOpenAccountPicker}
        className="inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200/80 active:scale-95 transition cursor-pointer mb-3"
      >
        <WalletChipIcon wallet={wallet} />
        <span className="text-xs font-semibold text-slate-700 tabular-nums">
          {walletLabel}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 stroke-[2.5]" />
      </button>

      <span className="text-xs font-medium text-slate-500 mb-1">Ton solde</span>

      {/* Solde : police normale (plus de font-mono), chiffres alignés */}
      <div className="text-[34px] sm:text-[38px] font-extrabold text-slate-900 tracking-tight leading-none mb-3 tabular-nums">
        {formatMoney(shownMain, balance.mainCurrency)}
      </div>
      {balance.second !== null && balance.secondCurrency && (
        <div className="text-sm font-semibold text-slate-400 tabular-nums -mt-1 mb-3">
          {formatMoney(shownSecond, balance.secondCurrency)}
        </div>
      )}

      <div className="mb-3" />

      {/* Les 4 boutons d'action */}
      <div className="w-full grid grid-cols-4 gap-3 max-w-sm">
        {ACTIONS.map(({ id, label, icon: Icon, highlight }) => (
          <div key={id} className="flex flex-col items-center">
            <button
              onClick={() => onActionClick(id)}
              aria-label={label}
              className={
                highlight
                  ? 'w-14 h-14 rounded-2xl bg-[#D8FB52] hover:bg-[#cbed3b] active:scale-95 flex items-center justify-center shadow-xs transition duration-150 cursor-pointer'
                  : 'w-14 h-14 rounded-2xl bg-white border border-slate-100 hover:bg-slate-50 active:scale-95 flex items-center justify-center shadow-xs transition duration-150 cursor-pointer'
              }
            >
              <Icon className="w-6 h-6 text-slate-900 stroke-[2.2]" />
            </button>
            <span className="text-xs font-semibold text-slate-700 mt-2">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
