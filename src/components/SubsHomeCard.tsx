import React, { useMemo } from 'react';
import { Repeat, ChevronRight } from 'lucide-react';
import { Recurring, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { findSubscriptions } from '../lib/review';
import { formatMoney, toMain } from '../lib/money';
import { getPrefs } from '../lib/display';
import { SecretMoney } from './MatrixSwap';

// Carte d'accueil « Abonnements » (cachée par défaut : Paramètres › Accueil) :
// ce que coûtent par mois les dépenses qui reviennent. Elle compte ce qui est déjà dans « À venir »
// (au rythme de chacune) + ce que Wallo a repéré et qui n'y est pas encore : jamais deux fois la même.
const perMonth = (r: Recurring) => {
  const n = Math.max(1, (r.frequency === 'days' ? r.everyDays : r.every) ?? 1);
  if (r.frequency === 'week') return (52 / 12) / n;
  if (r.frequency === 'days') return 30.4 / n;
  if (r.frequency === 'year') return 1 / (12 * n);
  return 1 / n;
};
export const SubsHomeCard: React.FC<{ transactions: Transaction[]; settings: Settings; categories: Category[]; recurrings: Recurring[]; onOpen: () => void }> = ({
  transactions,
  settings,
  categories,
  recurrings,
  onOpen,
}) => {
  const list = useMemo(() => {
    const saved = recurrings.filter((r) => r.active && r.direction === 'out' && r.amount).map((r) => toMain(r.amount!, r.currency, settings) * perMonth(r));
    const found = findSubscriptions(transactions, settings, categories, recurrings).filter((x) => !x.known).map((x) => x.amount);
    return [...saved, ...found];
  }, [transactions, settings, categories, recurrings]);
  if (list.length === 0) return null;
  const total = list.reduce((s, x) => s + x, 0);
  const money = (v: number) => formatMoney(Math.round(v), settings.mainCurrency, { ...getPrefs(), decimals: 'never' });
  return (
    <button onClick={onOpen} className="w-full text-left bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3.5 cursor-pointer hover:bg-slate-50 active:scale-[0.99] transition">
      <span className="w-12 h-12 rounded-full bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
        <Repeat className="w-6 h-6" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-slate-500">Abonnements</span>
        <span className="block text-[20px] font-extrabold tabular-nums tracking-tight text-slate-900 leading-tight">
          <SecretMoney text={money(total)} /> <span className="text-[13px] font-semibold text-slate-500">par mois</span>
        </span>
        <span className="block text-[12px] text-slate-500">
          {list.length} abonnement{list.length > 1 ? 's' : ''} · ≈ <SecretMoney text={money(total * 12)} /> par an
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  );
};
