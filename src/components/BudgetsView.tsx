import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Layers, Pencil, Trash2, PieChart } from 'lucide-react';
import { Budget, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { IconBadge } from './AppIcon';
import { TransactionItem } from './TransactionItem';
import { formatMoney } from '../lib/money';
import { budgetStatus, budgetTone, BudgetStatus, monthRange, pastSpending, roundBudget } from '../lib/budgets';
import { monthTitle } from '../lib/periods';

interface BudgetsViewProps {
  budgets: Budget[];
  transactions: Transaction[];
  categories: Category[];
  settings: Settings;
  onAdd: (b: Omit<Budget, 'id' | 'createdAt'>) => void;
  onUpdate: (id: string, changes: Partial<Budget>) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}

const monthLabel = (offset: number) => monthTitle(offset);

// Budgets du mois : combien on a prévu, combien on a dépensé, combien il reste
export const BudgetsView: React.FC<BudgetsViewProps> = ({
  budgets,
  transactions,
  categories,
  settings,
  onAdd,
  onUpdate,
  onDelete,
  onBack,
  onSelectTransaction,
}) => {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Budgets dont la catégorie existe encore
  const valid = budgets.filter((b) => b.categoryId === null || categories.some((c) => c.id === b.categoryId));
  const rows = useMemo(
    () =>
      valid
        .map((b) => ({ b, cat: categories.find((c) => c.id === b.categoryId), st: budgetStatus(b, transactions, categories, settings, offset) }))
        .sort((x, y) => (x.b.categoryId === null ? -1 : y.b.categoryId === null ? 1 : y.st.ratio - x.st.ratio)),
    [valid, categories, transactions, settings, offset]
  );

  // Total : le budget « toutes les dépenses » s'il existe, sinon la somme des catégories
  const global = rows.find((r) => r.b.categoryId === null);
  const main = settings.mainCurrency;
  const total = global ? global.b.amount : rows.reduce((s, r) => s + r.b.amount, 0);
  const spent = global ? global.st.spent : rows.reduce((s, r) => s + r.st.spent, 0);
  const currency = global?.b.currency ?? rows[0]?.b.currency ?? main;
  const money = (v: number, c = currency) => formatMoney(v, c);

  // Mois en cours : jours restants et montant possible par jour
  const now = new Date();
  const end = monthRange(0).end!;
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  const viewing = rows.find((r) => r.b.id === viewingId);

  return (
    <div className="px-5 pt-4 pb-8 animate-screen">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Budgets</h1>
        {rows.length > 0 && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#D8FB52] text-slate-900 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        )}
      </div>

      {/* Mois affiché */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 p-1.5 mb-3">
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Mois précédent" className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold text-slate-900">{offset === 0 ? `Ce mois-ci · ${monthLabel(0)}` : monthLabel(offset)}</span>
        <button
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset === 0}
          aria-label="Mois suivant"
          className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 text-center">
          <span className="w-14 h-14 mx-auto rounded-full bg-[#D8FB52]/40 flex items-center justify-center mb-3">
            <PieChart className="w-7 h-7 text-slate-900" />
          </span>
          <h2 className="text-base font-bold text-slate-900">Fixe-toi une limite par mois</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Par exemple 150 000 CDF pour l'alimentation. Wallo te montre ce qu'il reste et te prévient quand tu approches de la limite.
          </p>
          <button onClick={() => setEditing('new')} className="w-full py-3 rounded-2xl bg-[#D8FB52] text-slate-900 text-sm font-bold cursor-pointer">
            Créer mon premier budget
          </button>
        </div>
      ) : (
        <>
          {/* Résumé */}
          <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-500">{global ? 'Toutes les dépenses' : 'Total des budgets'}</span>
              <span className="text-xs font-semibold tabular-nums text-slate-500">{Math.round((spent / (total || 1)) * 100)} %</span>
            </div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-900 mt-0.5">
              {money(spent)} <span className="text-sm font-semibold text-slate-400">sur {money(total)}</span>
            </div>
            <Bar ratio={spent / (total || 1)} big />
            <p className={`text-xs mt-2 ${total - spent < 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
              {total - spent < 0
                ? `Dépassé de ${money(spent - total)}.`
                : offset === 0
                  ? `Il reste ${money(total - spent)} pour ${daysLeft} jour${daysLeft > 1 ? 's' : ''}, soit environ ${money((total - spent) / daysLeft)} par jour.`
                  : `${money(total - spent)} non dépensés ce mois-là.`}
            </p>
          </div>

          <div className="space-y-2">
            {rows.map(({ b, cat, st }) => (
              <button
                key={b.id}
                onClick={() => setViewingId(b.id)}
                className="w-full text-left bg-white rounded-3xl border border-slate-100 p-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50"
              >
                <BudgetIcon cat={cat} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">{cat?.name ?? 'Toutes les dépenses'}</span>
                    <span className={`text-xs font-bold tabular-nums shrink-0 ${st.left < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      {st.left < 0 ? `+${money(-st.left, b.currency)}` : `Reste ${money(st.left, b.currency)}`}
                    </span>
                  </div>
                  <Bar ratio={st.ratio} />
                  <div className="text-[11px] tabular-nums text-slate-500 mt-1">
                    {money(st.spent, b.currency)} sur {money(b.amount, b.currency)} · {Math.round(st.ratio * 100)} %
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {viewing && (
        <BudgetDetail
          budget={viewing.b}
          cat={viewing.cat}
          status={viewing.st}
          month={monthLabel(offset)}
          onClose={() => setViewingId(null)}
          onEdit={() => {
            setEditing(viewing.b);
            setViewingId(null);
          }}
          onDelete={() => {
            onDelete(viewing.b.id);
            setViewingId(null);
          }}
          onSelectTransaction={onSelectTransaction}
        />
      )}

      {editing && (
        <BudgetSheet
          budget={editing === 'new' ? null : editing}
          taken={valid.map((b) => b.categoryId)}
          categories={categories}
          transactions={transactions}
          settings={settings}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === 'new') onAdd(data);
            else onUpdate(editing.id, data);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const Bar: React.FC<{ ratio: number; big?: boolean }> = ({ ratio, big }) => (
  <div className={`${big ? 'h-2.5 mt-3' : 'h-1.5 mt-1.5'} rounded-full bg-slate-100 overflow-hidden`}>
    <div className={`h-full rounded-full animate-bar ${budgetTone(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
  </div>
);

const BudgetIcon: React.FC<{ cat?: Category; size?: 'sm' | 'md' }> = ({ cat, size = 'md' }) =>
  cat ? (
    <IconBadge icon={cat.icon} image={cat.image} color={cat.color} size={size} />
  ) : (
    <span className={`${size === 'md' ? 'w-11 h-11' : 'w-9 h-9'} rounded-full bg-[#D8FB52] flex items-center justify-center shrink-0`}>
      <Layers className="w-5 h-5 text-slate-900" />
    </span>
  );

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold">{title}</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// Détail : chiffres du mois + les dépenses qui comptent dans ce budget
const BudgetDetail: React.FC<{
  budget: Budget;
  cat?: Category;
  status: BudgetStatus;
  month: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}> = ({ budget: b, cat, status: st, month, onClose, onEdit, onDelete, onSelectTransaction }) => {
  const [confirm, setConfirm] = useState(false);
  const money = (v: number) => formatMoney(v, b.currency);
  return (
    <Sheet title={cat?.name ?? 'Toutes les dépenses'} onClose={onClose}>
      <div className="flex items-center gap-3 mb-2">
        <BudgetIcon cat={cat} />
        <div className="flex-1">
          <div className="text-xs text-slate-500">{month}</div>
          <div className="text-lg font-extrabold tabular-nums">
            {money(st.spent)} <span className="text-sm font-semibold text-slate-400">sur {money(b.amount)}</span>
          </div>
        </div>
      </div>
      <Bar ratio={st.ratio} big />
      <p className={`text-xs mt-2 mb-3 ${st.left < 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
        {st.left < 0 ? `Dépassé de ${money(-st.left)}.` : `Il reste ${money(st.left)}.`}
      </p>
      {confirm ? (
        <div className="p-3 rounded-2xl bg-red-50 mb-3">
          <p className="text-sm text-slate-700 mb-2">Supprimer ce budget ? Tes dépenses ne changent pas.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold cursor-pointer">
              Annuler
            </button>
            <button onClick={onDelete} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer">
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mb-3">
          <button onClick={onEdit} className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
            <Pencil className="w-4 h-4" /> Modifier
          </button>
          <button onClick={() => setConfirm(true)} className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-red-50 text-red-600 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
            <Trash2 className="w-4 h-4" /> Supprimer
          </button>
        </div>
      )}
      <div className="text-xs font-bold text-slate-500 mb-1">
        {st.txs.length} dépense{st.txs.length > 1 ? 's' : ''} ce mois-là
      </div>
      {st.txs.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">Aucune dépense dans ce budget.</p>
      ) : (
        [...st.txs]
          .sort((a, c) => c.createdAt.localeCompare(a.createdAt))
          .map((t) => <TransactionItem key={t.id} transaction={t} onClick={onSelectTransaction} />)
      )}
    </Sheet>
  );
};

// Créer / modifier : choix de la catégorie + montant, avec une suggestion tirée des mois passés
const BudgetSheet: React.FC<{
  budget: Budget | null;
  taken: (string | null)[];
  categories: Category[];
  transactions: Transaction[];
  settings: Settings;
  onClose: () => void;
  onSave: (b: Omit<Budget, 'id' | 'createdAt'>) => void;
}> = ({ budget, taken, categories, transactions, settings, onClose, onSave }) => {
  const [categoryId, setCategoryId] = useState<string | null | undefined>(budget ? budget.categoryId : undefined);
  const [amount, setAmount] = useState(budget ? String(budget.amount) : '');
  const currency = budget?.currency ?? settings.mainCurrency;
  // Catégories principales de dépenses pas encore budgétées (+ celle du budget modifié)
  const choices = categories.filter(
    (c) => !c.parentId && (c.type === 'expense' || (c.type === 'debt' && c.direction === 'out')) && (!taken.includes(c.id) || c.id === budget?.categoryId)
  );
  const globalFree = !taken.includes(null) || budget?.categoryId === null;
  const past = categoryId !== undefined ? pastSpending(categoryId, transactions, categories, settings) : null;
  const suggestion = past ? roundBudget(past.average) : 0;
  const value = parseFloat(amount.replace(/\s/g, '').replace(',', '.'));
  const valid = categoryId !== undefined && value > 0;

  const tile = (id: string | null, label: string, icon: React.ReactNode) => (
    <button
      key={id ?? 'all'}
      onClick={() => setCategoryId(id)}
      className={`min-w-0 flex flex-col items-center gap-1 p-2 rounded-2xl border-2 cursor-pointer ${
        categoryId === id ? 'border-slate-900 bg-[#D8FB52]/40' : 'border-transparent bg-slate-100 hover:bg-slate-200/70'
      }`}
    >
      {icon}
      <span className="w-full text-center text-[11px] font-bold text-slate-900 leading-tight line-clamp-2 break-words hyphens-auto" lang="fr">{label}</span>
    </button>
  );

  return (
    <Sheet title={budget ? 'Modifier le budget' : 'Nouveau budget'} onClose={onClose}>
      {!budget && (
        <>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Pour quoi ?</div>
          <div className="grid grid-cols-3 gap-1.5 mb-4 max-h-[40dvh] overflow-y-auto">
            {globalFree && tile(null, 'Toutes les dépenses', <BudgetIcon size="sm" />)}
            {choices.map((c) => tile(c.id, c.name, <IconBadge icon={c.icon} image={c.image} color={c.color} size="sm" />))}
          </div>
        </>
      )}

      <label className="text-xs font-semibold text-slate-500">Limite par mois ({currency})</label>
      <input
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="ex. 150000"
        className="w-full mt-1 px-4 py-3 rounded-2xl bg-slate-100 text-lg font-bold tabular-nums outline-none focus:ring-2 focus:ring-[#D8FB52]"
      />
      {past && (past.last > 0 || past.average > 0) && (
        <div className="flex items-center justify-between gap-2 mt-2 p-3 rounded-2xl bg-slate-100">
          <span className="text-xs text-slate-600">
            Mois dernier : <b className="tabular-nums">{formatMoney(past.last, currency)}</b>
            <br />
            Moyenne sur 3 mois : <b className="tabular-nums">{formatMoney(past.average, currency)}</b>
          </span>
          {suggestion > 0 && (
            <button onClick={() => setAmount(String(suggestion))} className="shrink-0 px-3 py-2 rounded-xl bg-white text-xs font-bold cursor-pointer">
              Utiliser {formatMoney(suggestion, currency)}
            </button>
          )}
        </div>
      )}

      <button
        disabled={!valid}
        onClick={() => onSave({ categoryId: categoryId ?? null, amount: value, currency })}
        className="w-full mt-4 py-3.5 rounded-2xl bg-[#D8FB52] disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 text-sm font-bold cursor-pointer"
      >
        {categoryId === undefined ? 'Choisis une catégorie' : !(value > 0) ? 'Saisis un montant' : 'Enregistrer'}
      </button>
    </Sheet>
  );
};
