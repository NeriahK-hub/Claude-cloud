import React from 'react';
import { ArrowUpRight, ArrowDownLeft, PieChart, Target, Users, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { setPrefs, useDisplayPrefs } from '../lib/display';
import { BalanceInfo, formatMoney } from '../lib/money';
import { useCountUp } from '../hooks/useCountUp';
import { Wallet } from '../types';
import { WalletChipIcon } from './AppIcon';
import { MatrixSwap } from './MatrixSwap';
import { featureOn, useRemoteConfig } from '../lib/remoteConfig';

// Les actions possibles depuis l'accueil
export type HomeAction = 'expense' | 'income' | 'budget' | 'goals' | 'ristourne';

interface BalanceSectionProps {
  balance: BalanceInfo;
  walletLabel: string;
  wallet: Wallet | null; // null = tous les portefeuilles
  onOpenAccountPicker: () => void;
  onActionClick: (action: HomeAction) => void;
  hideActions?: boolean; // mode simple : les gros boutons sont affichés à part
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
  { id: 'goals', label: 'Objectifs', icon: Target },
  { id: 'ristourne', label: 'Ristourne', icon: Users },
];

// Boutons de l'accueil, sans ceux des fonctionnalités désactivées (espace admin)
export function useHomeActions() {
  const remote = useRemoteConfig();
  return ACTIONS.filter((a) => (a.id !== 'budget' || featureOn(remote, 'budgets')) && (a.id !== 'ristourne' || featureOn(remote, 'ristournes')));
}

// « Ton solde » + œil pour masquer / afficher (mémorisé sur cet appareil)
export const BalanceLabel: React.FC<{ className?: string }> = ({ className = 'text-slate-500' }) => {
  const { hideBalance } = useDisplayPrefs();
  const Icon = hideBalance ? EyeOff : Eye;
  return (
    <div className={`inline-flex items-center gap-2 text-xs font-medium ${className}`}>
      Ton solde
      {/* Bouton bien visible, avec le mot : on comprend tout de suite à quoi il sert */}
      <button
        onClick={() => setPrefs({ hideBalance: !hideBalance })}
        data-coach="eye"
        aria-pressed={hideBalance}
        className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-semibold cursor-pointer transition active:scale-95"
      >
        <Icon key={String(hideBalance)} className="w-[18px] h-[18px] animate-fade-in" />
        {hideBalance ? 'Afficher' : 'Masquer'}
      </button>
    </div>
  );
};

export const BalanceSection: React.FC<BalanceSectionProps> = ({
  balance,
  walletLabel,
  wallet,
  onOpenAccountPicker,
  onActionClick,
  hideActions,
}) => {
  const actions = useHomeActions();
  const shownMain = useCountUp(balance.main);
  const shownSecond = useCountUp(balance.second ?? 0);
  const { hideBalance, iconsOnly } = useDisplayPrefs();

  return (
    <div className="px-5 pt-3 pb-4 flex flex-col items-center text-center">
      {/* Choix du portefeuille (M-Pesa, Airtel Money, cash...) */}
      <button
        onClick={onOpenAccountPicker}
        data-coach="wallet"
        className="inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200/80 active:scale-95 transition cursor-pointer mb-3"
      >
        <WalletChipIcon wallet={wallet} />
        <span className="text-xs font-semibold text-slate-700 tabular-nums">
          {walletLabel}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 stroke-[2.5]" />
      </button>

      <BalanceLabel className="text-slate-500 mb-1" />

      {/* Solde : police normale (plus de font-mono), chiffres alignés */}
      <div className="text-[34px] sm:text-[38px] font-extrabold text-slate-900 tracking-tight leading-none mb-3 tabular-nums">
        <MatrixSwap hidden={hideBalance} text={formatMoney(shownMain, balance.mainCurrency)} />
      </div>
      {balance.second !== null && balance.secondCurrency && (
        <div className="text-sm font-semibold text-slate-400 tabular-nums -mt-1 mb-3">
          <MatrixSwap hidden={hideBalance} text={formatMoney(shownSecond, balance.secondCurrency)} />
        </div>
      )}

      {!hideActions && <div className="mb-3" />}

      {/* Les boutons d'action (resserrés quand il y en a 5) */}
      {!hideActions && <div className={`w-full grid max-w-sm ${actions.length > 4 ? 'gap-1.5' : 'gap-3'}`} style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
        {actions.map(({ id, label, icon: Icon, highlight }) => (
          <div key={id} className="flex flex-col items-center">
            <button
              onClick={() => onActionClick(id)}
              aria-label={label}
              className={
                highlight
                  ? 'w-14 h-14 rounded-2xl bg-accent hover:bg-accent-hover active:scale-95 flex items-center justify-center shadow-xs transition duration-150 cursor-pointer'
                  : 'w-14 h-14 rounded-2xl bg-white border border-slate-100 hover:bg-slate-50 active:scale-95 flex items-center justify-center shadow-xs transition duration-150 cursor-pointer'
              }
            >
              <Icon className="w-6 h-6 text-slate-900 stroke-[2.2]" />
            </button>
            {!iconsOnly && <span className="text-xs font-semibold text-slate-700 mt-2">{label}</span>}
          </div>
        ))}
      </div>}
    </div>
  );
};
