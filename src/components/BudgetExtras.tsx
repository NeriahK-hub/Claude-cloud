import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { Budget, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { IconBadge } from './AppIcon';
import { BudgetSuggestion, budgetHistory, suggestBudgets } from '../lib/budgetInsights';
import { formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';
import { haptic } from '../lib/haptics';

const about = (v: number, cur: string) => formatMoney(Math.round(v), cur, { ...getPrefs(), decimals: 'never' });

// « Budgets conseillés » : d'après les 3 derniers mois, un budget à créer d'un toucher
export const BudgetSuggestions: React.FC<{
  transactions: Transaction[];
  categories: Category[];
  settings: Settings;
  budgets: Budget[];
  onCreate: (s: BudgetSuggestion) => void;
}> = ({ transactions, categories, settings, budgets, onCreate }) => {
  const list = useMemo(() => suggestBudgets(transactions, categories, settings, budgets), [transactions, categories, settings, budgets]);
  if (list.length === 0) return null;
  const cur = settings.mainCurrency;
  return (
    <section className="mt-5">
      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
        <Sparkles className="w-3.5 h-3.5" /> Budgets conseillés
      </h3>
      <div className="bg-white rounded-3xl border border-slate-100 px-4 divide-y divide-slate-100">
        {list.map((s) => {
          const c = categories.find((x) => x.id === s.categoryId)!;
          return (
            <div key={s.categoryId} className="py-3 flex items-center gap-3">
              <IconBadge icon={c.icon} image={c.image} color={c.color} size="sm" />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold text-slate-900 truncate">{c.name}</span>
                <span className="block text-[12px] text-slate-500 truncate">Tu dépenses ≈ {about(s.average, cur)} par mois</span>
              </span>
              <button
                onClick={() => {
                  haptic('success');
                  onCreate(s);
                }}
                className="shrink-0 h-9 px-3.5 rounded-full bg-accent hover:bg-accent-hover text-[13px] font-bold tabular-nums cursor-pointer active:scale-95 transition"
              >
                {about(s.amount, cur)}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-slate-400 mt-1.5 px-1 leading-snug">Un peu en dessous de ce que tu dépenses d'habitude. Tu pourras le changer ensuite.</p>
    </section>
  );
};

// Historique : les 6 dernières périodes de chaque budget, un point par période (vert tenu, orange limite, rouge dépassé)
export const BudgetHistory: React.FC<{ budgets: Budget[]; transactions: Transaction[]; categories: Category[]; settings: Settings }> = ({ budgets, transactions, categories, settings }) => {
  const rows = useMemo(
    () => budgets.map((b) => ({ b, cells: budgetHistory(b, transactions, categories, settings) })).filter((r) => r.cells.filter((c) => c.ratio !== null).length >= 2),
    [budgets, transactions, categories, settings]
  );
  if (rows.length === 0) return null;
  const cells = rows.flatMap((r) => r.cells).filter((c) => c.ratio !== null);
  const kept = cells.filter((c) => (c.ratio ?? 0) < 1).length;
  const dot = (ratio: number | null) => (ratio === null ? 'bg-slate-200' : ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500');
  const head = rows[0].cells;
  return (
    <section className="mt-5">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">Historique</h3>
      <div className="bg-white rounded-3xl border border-slate-100 p-4">
        <p className="text-[14px] text-slate-700 mb-3">
          Budget tenu <b className="text-slate-900">{kept} fois sur {cells.length}</b> ces derniers temps.
        </p>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0" />
            <span className="flex-1 grid grid-cols-6 text-center">
              {head.map((c) => (
                <span key={c.offset} className="text-[11px] text-slate-400 capitalize truncate">
                  {c.label}
                </span>
              ))}
            </span>
          </div>
          {rows.map(({ b, cells: cs }) => {
            const cat = categories.find((c) => c.id === b.categoryId);
            return (
              <div key={b.id} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[13px] font-semibold text-slate-800 truncate">{cat?.name ?? 'Tout'}</span>
                <span className="flex-1 grid grid-cols-6 place-items-center">
                  {cs.map((c) => (
                    <span
                      key={c.offset}
                      title={c.ratio === null ? 'Pas encore de budget' : `${Math.round(c.ratio * 100)} % utilisé`}
                      aria-label={`${c.label} : ${c.ratio === null ? 'pas de budget' : `${Math.round(c.ratio * 100)} % utilisé`}`}
                      className={`w-3.5 h-3.5 rounded-full ${dot(c.ratio)}`}
                    />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Tenu</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Presque</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Dépassé</span>
        </div>
      </div>
    </section>
  );
};
