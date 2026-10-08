import React from 'react';
import { X, Check, Plus, Layers } from 'lucide-react';
import { Transaction, Wallet } from '../types';
import { IconBadge } from './AppIcon';
import { SecretMoney } from './MatrixSwap';
import { BalanceInfo, formatMoney, walletBalance } from '../lib/money';

interface AccountSwitcherSheetProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: Wallet[];
  transactions: Transaction[];
  activeWalletId: string; // 'all' ou l'id d'un portefeuille
  totalBalance: BalanceInfo;
  onSelect: (id: string) => void;
  onAddWallet: () => void;
}

export const AccountSwitcherSheet: React.FC<AccountSwitcherSheetProps> = ({
  isOpen,
  onClose,
  wallets,
  transactions,
  activeWalletId,
  totalBalance,
  onSelect,
  onAddWallet,
}) => {
  if (!isOpen) return null;

  const rowCls = (selected: boolean) =>
    `p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
      selected ? 'border-transparent is-selected' : 'border-slate-200 hover:bg-slate-50'
    }`;
  const check = (
    <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
      <Check className="w-3.5 h-3.5 text-slate-950 stroke-[3]" />
    </div>
  );

  // Les portefeuilles exclus du total viennent en dernier, sous leur propre titre
  const included = wallets.filter((w) => w.includeInTotal);
  const excluded = wallets.filter((w) => !w.includeInTotal);
  const row = (w: Wallet) => (
    <div key={w.id} role="button" onClick={() => { onSelect(w.id); onClose(); }} className={rowCls(w.id === activeWalletId)}>
      <div className="flex items-center gap-3">
        <IconBadge icon={w.icon} image={w.image} color={w.color} />
        <div>
          <div className="text-sm font-bold text-slate-900">{w.name}</div>
          <div className="text-xs font-bold text-slate-700 tabular-nums">
            <SecretMoney text={formatMoney(walletBalance(w, transactions), w.currency)} />
          </div>
        </div>
      </div>
      {w.id === activeWalletId && check}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden"></div>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Choisir un portefeuille</h3>
            <p className="text-xs text-slate-500 mt-0.5">Le solde et l'historique suivent ton choix</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div role="button" onClick={() => { onSelect('all'); onClose(); }} className={rowCls(activeWalletId === 'all')}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
                <Layers className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Tous les portefeuilles</div>
                <div className="text-xs font-bold text-slate-700 tabular-nums">
                  <SecretMoney text={formatMoney(totalBalance.main, totalBalance.mainCurrency)} />
                </div>
              </div>
            </div>
            {activeWalletId === 'all' && check}
          </div>

          {included.map(row)}

          {excluded.length > 0 && (
            <h4 className="pt-3 px-1 text-[12px] font-bold text-slate-400 tracking-wider uppercase">Exclus du total</h4>
          )}
          {excluded.map(row)}
        </div>

        <button
          onClick={onAddWallet}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 flex items-center justify-center gap-2 text-xs font-bold text-slate-700 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter un portefeuille</span>
        </button>
      </div>
    </div>
  );
};
