import React, { useMemo } from 'react';
import { Repeat, ChevronRight } from 'lucide-react';
import { Recurring, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { findSubscriptions } from '../lib/review';
import { formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';
import { SecretMoney } from './MatrixSwap';

// Carte d'accueil « Abonnements repérés » (cachée par défaut : Paramètres › Accueil) :
// les dépenses qui reviennent chaque mois et que Wallo propose d'ajouter à « À venir ».
export const SubsHomeCard: React.FC<{ transactions: Transaction[]; settings: Settings; categories: Category[]; recurrings: Recurring[]; onOpen: () => void }> = ({
  transactions,
  settings,
  categories,
  recurrings,
  onOpen,
}) => {
  // Seulement ceux qui ne sont pas encore dans « À venir » : une fois ajouté, il n'est plus proposé
  const list = useMemo(() => findSubscriptions(transactions, settings, categories, recurrings).filter((x) => !x.known), [transactions, settings, categories, recurrings]);
  if (list.length === 0) return null;
  const total = list.reduce((s, x) => s + x.amount, 0);
  const money = (v: number) => formatMoney(Math.round(v), settings.mainCurrency, { ...getPrefs(), decimals: 'never' });
  return (
    <button onClick={onOpen} className="w-full text-left bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3.5 cursor-pointer hover:bg-slate-50 active:scale-[0.99] transition">
      <span className="w-12 h-12 rounded-full bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
        <Repeat className="w-6 h-6" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-slate-500">Abonnements repérés</span>
        <span className="block text-[20px] font-extrabold tabular-nums tracking-tight text-slate-900 leading-tight">
          <SecretMoney text={money(total)} /> <span className="text-[13px] font-semibold text-slate-500">par mois</span>
        </span>
        <span className="block text-[12px] text-slate-500">
          {list.length} à ajouter · ≈ <SecretMoney text={money(total * 12)} /> par an
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  );
};
