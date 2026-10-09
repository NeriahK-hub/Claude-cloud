import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Budget, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { budgetStatus, budgetTone, periodOf, PERIODS } from '../lib/budgets';
import { formatMoney, walletBalance } from '../lib/money';
import { IconBadge } from './AppIcon';
import { SecretMoney } from './MatrixSwap';

// Deux cartes d'accueil au choix (Paramètres › Accueil), cachées par défaut :
// les budgets qui chauffent le plus, et la progression des objectifs d'épargne.

const Shell: React.FC<{ title: string; onOpen: () => void; children: React.ReactNode }> = ({ title, onOpen, children }) => (
  <button onClick={onOpen} className="w-full text-left bg-white rounded-3xl border border-slate-100 p-4 cursor-pointer hover:bg-slate-50 active:scale-[0.99] transition">
    <span className="flex items-center justify-between mb-3">
      <span className="text-[13px] font-semibold text-slate-500">{title}</span>
      <ChevronRight className="w-4 h-4 text-slate-300" />
    </span>
    <span className="block space-y-3.5">{children}</span>
  </button>
);

const Bar: React.FC<{ ratio: number; tone: string }> = ({ ratio, tone }) => (
  <span className="block h-2 rounded-full bg-slate-100 overflow-hidden mt-1.5">
    <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
  </span>
);

export const BudgetsHomeCard: React.FC<{ budgets: Budget[]; transactions: Transaction[]; categories: Category[]; settings: Settings; onOpen: () => void }> = ({
  budgets,
  transactions,
  categories,
  settings,
  onOpen,
}) => {
  const rows = useMemo(
    () =>
      budgets
        .map((b) => ({ b, st: budgetStatus(b, transactions, categories, settings) }))
        .sort((a, c) => c.st.ratio - a.st.ratio)
        .slice(0, 3),
    [budgets, transactions, categories, settings]
  );
  if (rows.length === 0) return null;
  return (
    <Shell title="Budgets" onOpen={onOpen}>
      {rows.map(({ b, st }) => {
        const cat = categories.find((c) => c.id === b.categoryId);
        return (
          <span key={b.id} className="flex items-center gap-3">
            {cat ? <IconBadge icon={cat.icon} image={cat.image} color={cat.color} size="sm" /> : <span className="w-9 h-9 rounded-full bg-accent shrink-0" />}
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-semibold text-slate-900 truncate">{cat?.name ?? 'Toutes les dépenses'}</span>
                <span className={`text-[12px] font-semibold tabular-nums shrink-0 ${st.left < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                  {st.left < 0 ? 'Dépassé' : <SecretMoney text={formatMoney(Math.round(st.left), b.currency)} />}
                </span>
              </span>
              <Bar ratio={st.ratio} tone={budgetTone(st.ratio)} />
              <span className="block text-[11px] text-slate-400 mt-1">{PERIODS.find((p) => p.id === periodOf(b))!.now}</span>
            </span>
          </span>
        );
      })}
    </Shell>
  );
};

export const GoalsHomeCard: React.FC<{ wallets: Wallet[]; transactions: Transaction[]; onOpen: () => void }> = ({ wallets, transactions, onOpen }) => {
  const goals = wallets.filter((w) => w.kind === 'goal' && !w.archived && w.goalAmount).slice(0, 3);
  if (goals.length === 0) return null;
  return (
    <Shell title="Objectifs" onOpen={onOpen}>
      {goals.map((w) => {
        const ratio = Math.max(0, walletBalance(w, transactions)) / (w.goalAmount as number);
        return (
          <span key={w.id} className="flex items-center gap-3">
            <IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-semibold text-slate-900 truncate">{w.name}</span>
                <span className="text-[12px] font-semibold tabular-nums text-slate-500 shrink-0">{Math.min(100, Math.round(ratio * 100))} %</span>
              </span>
              <Bar ratio={ratio} tone={ratio >= 1 ? 'bg-emerald-500' : 'bg-accent'} />
            </span>
          </span>
        );
      })}
    </Shell>
  );
};
