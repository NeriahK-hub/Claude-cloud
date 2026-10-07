import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { takeJump } from '../lib/jumpTo';
import { BudgetDraft, clearBudgetDraft, peekBudgetDraft } from '../lib/budgetDraft';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, X, Layers, Pencil, Trash2, PieChart, Delete, CalendarDays, HelpCircle } from 'lucide-react';
import { Budget, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { IconBadge } from './AppIcon';
import { TransactionItem } from './TransactionItem';
import { formatMoney } from '../lib/money';
import { budgetPace, budgetRange, budgetStatus, budgetTone, BudgetStatus, existedIn, firstOffset, pastSpending, periodOf, PERIODS, rangeText, roundBudget } from '../lib/budgets';
import { BudgetPeriod } from '../types';
import { monthTitle } from '../lib/periods';
import { haptic } from '../lib/haptics';
import { DateField } from './DatePicker';
import { SelCheck } from './SelCheck';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { getPrefs } from '../lib/display';

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
  const desktop = useIsDesktop(); // ordinateur : pas de retour ni de titre en double, contenu sur plusieurs colonnes
  const [offset, setOffset] = useState(0);
  // Arrivée depuis un conseil : la fiche s'ouvre déjà remplie (ou le budget existant de cette catégorie)
  const [draft] = useState(peekBudgetDraft);
  useEffect(() => clearBudgetDraft(), []);
  // Conseil « … va déborder » : on ouvre ce budget (dans le bon onglet : semaine, mois…)
  useLayoutEffect(() => {
    const j = takeJump('budget');
    const b = j && budgets.find((x) => x.id === j.id);
    if (b) {
      setTab(periodOf(b));
      setViewingId(b.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState<Budget | 'new' | null>(() => {
    if (!draft || !categories.some((c) => c.id === draft.categoryId)) return null;
    return budgets.find((b) => b.categoryId === draft.categoryId && periodOf(b) === 'month') ?? 'new';
  });
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Budgets dont la catégorie existe encore
  const valid = budgets.filter((b) => b.categoryId === null || categories.some((c) => c.id === b.categoryId));
  // Onglets : les périodes qui ont des budgets (le mois d'abord s'il y en a)
  const kinds = PERIODS.map((p) => p.id).filter((k) => valid.some((b) => periodOf(b) === k));
  const [tabPick, setTab] = useState<BudgetPeriod | null>(null);
  const tab: BudgetPeriod = tabPick && kinds.includes(tabPick) ? tabPick : kinds.includes('month') ? 'month' : kinds[0] ?? 'month';
  // Une période passée ne montre que les budgets qui existaient déjà, et on ne remonte pas avant le premier
  const minOffset = useMemo(() => firstOffset(valid.filter((b) => periodOf(b) === tab), tab), [valid, tab]);
  const rows = useMemo(
    () =>
      valid
        .filter((b) => periodOf(b) === tab && (tab === 'custom' || existedIn(b, budgetRange({ period: tab }, offset))))
        .map((b) => ({ b, cat: categories.find((c) => c.id === b.categoryId), st: budgetStatus(b, transactions, categories, settings, offset) }))
        .sort((x, y) => (x.b.categoryId === null ? -1 : y.b.categoryId === null ? 1 : y.st.ratio - x.st.ratio)),
    [valid, categories, transactions, settings, offset, tab]
  );
  const info = PERIODS.find((p) => p.id === tab)!;
  const custom = tab === 'custom';
  const range = custom ? null : budgetRange({ period: tab }, offset);
  const periodLabel = custom ? '' : tab === 'month' ? monthLabel(offset) : rangeText(range!);

  // Total : le budget « toutes les dépenses » s'il existe, sinon la somme des catégories
  const global = rows.find((r) => r.b.categoryId === null);
  const main = settings.mainCurrency;
  const total = global ? global.b.amount : rows.reduce((s, r) => s + r.b.amount, 0);
  const spent = global ? global.st.spent : rows.reduce((s, r) => s + r.st.spent, 0);
  const currency = global?.b.currency ?? rows[0]?.b.currency ?? main;
  const money = (v: number, c = currency) => formatMoney(v, c);
  // Estimations (≈) : arrondies, sans centimes
  const about = (v: number, c = currency) => formatMoney(Math.round(v), c, { ...getPrefs(), decimals: 'never' });

  // Mois en cours : jours restants et montant possible par jour
  const now = new Date();
  const end = custom ? rows[0]?.st.end ?? now : budgetRange({ period: tab }, 0).end;
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  const isNow = custom ? rows.every((r) => r.st.start <= now && now < r.st.end) : offset === 0;
  const viewing = rows.find((r) => r.b.id === viewingId);

  return (
    <div className={desktop ? 'max-w-5xl animate-screen' : 'px-5 pt-4 pb-8 animate-screen'}>
      <div className={`${desktop ? 'desk-head' : 'page-head'} flex items-center gap-3 mb-4`}>
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Budgets</h1>
        {rows.length > 0 && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-accent text-slate-900 text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        )}
      </div>

      {/* Périodes : onglets (seulement s'il y a des budgets de plusieurs périodes) */}
      {kinds.length > 1 && (
        <div className="flex gap-1 p-1 rounded-2xl bg-slate-200/60 mb-2 overflow-x-auto no-scrollbar">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => {
                haptic();
                setTab(k);
                setOffset(0);
              }}
              aria-pressed={tab === k}
              className={`flex-1 shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${tab === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
            >
              {{ week: 'Semaine', month: 'Mois', quarter: 'Trimestre', year: 'Année', custom: 'Personnalisé' }[k]}
            </button>
          ))}
        </div>
      )}

      {/* Période affichée (on remonte le temps avec ‹) */}
      {!custom && (
        <div className="flex items-center justify-between bg-white rounded-full border border-slate-100 p-1 mb-3">
          <button
            onClick={() => { haptic(); setOffset((o) => Math.max(minOffset, o - 1)); }}
            disabled={offset <= minOffset}
            aria-label="Période précédente"
            className="w-9 h-9 rounded-full hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center cursor-pointer transition disabled:opacity-25 disabled:cursor-default"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[14px] font-semibold text-slate-900 truncate px-1">{offset === 0 ? `${info.now} · ${periodLabel}` : periodLabel}</span>
          <button
            onClick={() => { haptic(); setOffset((o) => Math.min(0, o + 1)); }}
            disabled={offset === 0}
            aria-label="Période suivante"
            className="w-9 h-9 rounded-full hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center cursor-pointer transition disabled:opacity-25 disabled:cursor-default"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 text-center">
          <span className="w-14 h-14 mx-auto rounded-full bg-accent/40 flex items-center justify-center mb-3">
            <PieChart className="w-7 h-7 text-slate-900" />
          </span>
          <h2 className="text-base font-bold text-slate-900">Fixe-toi une limite</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Par exemple 150 000 CDF pour l'alimentation. Wallo te montre ce qu'il reste et te prévient quand tu approches de la limite.
          </p>
          <button onClick={() => setEditing('new')} className="w-full py-3 rounded-2xl bg-accent text-slate-900 text-sm font-bold cursor-pointer">
            Créer mon premier budget
          </button>
        </div>
      ) : (
        <>
          {/* Résumé : un anneau qui se remplit, ce qu'il reste en grand, puis trois repères */}
          <div className="bg-white rounded-3xl border border-slate-100 p-5 mb-4">
            <div className="flex items-center gap-4">
              <Ring ratio={spent / (total || 1)} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-slate-500">
                  {total - spent < 0 ? 'Dépassé de' : isNow ? 'Il te reste' : 'Non dépensé'}
                </div>
                <div className={`${money(Math.abs(total - spent)).length > 14 ? 'text-[20px]' : 'text-[26px]'} leading-tight font-bold tracking-tight tabular-nums break-words ${total - spent < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {money(Math.abs(total - spent))}
                </div>
                <div className="text-[13px] text-slate-500 mt-0.5">
                  sur {money(total)}
                  {isNow && total - spent >= 0 && <> · <span className="whitespace-nowrap">{daysLeft} jour{daysLeft > 1 ? 's' : ''}</span></>}
                </div>
                <div className="text-[12px] text-slate-400 mt-0.5">{money(spent)} dépensés</div>
              </div>
            </div>
            {(range || rows.length === 1) && <PaceRows spent={spent} amount={total} range={range ?? rows[0].st} money={about} />}
          </div>

          <div className={desktop ? 'grid grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-2'}>
            {rows.map(({ b, cat, st }) => (
              <button
                key={b.id}
                onClick={() => setViewingId(b.id)}
                className="w-full text-left bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3.5 cursor-pointer hover:bg-slate-50 active:scale-[0.99] transition"
              >
                <BudgetIcon cat={cat} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold text-slate-900 truncate">{cat?.name ?? 'Toutes les dépenses'}</span>
                    <span className="text-[12px] font-semibold tabular-nums text-slate-400 shrink-0">{Math.round(st.ratio * 100)} %</span>
                  </div>
                  <Bar ratio={st.ratio} />
                  <div className={`mt-1.5 text-[13px] font-semibold tabular-nums ${st.left < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {st.left < 0 ? `Dépassé de ${money(-st.left, b.currency)}` : `Reste ${money(st.left, b.currency)}`}
                  </div>
                  <div className="text-[12px] tabular-nums text-slate-500">
                    {money(st.spent, b.currency)} dépensés sur {money(b.amount, b.currency)}
                    {custom && ` · ${rangeText(st)}`}
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
          month={viewing.b.period === 'custom' ? rangeText(viewing.st) : `${PERIODS.find((p) => p.id === periodOf(viewing.b))!.now} · ${rangeText(viewing.st)}`}
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
          draft={editing === 'new' ? draft : null}
          budgets={valid}
          defaultPeriod={editing === 'new' && draft ? 'month' : tab}
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

// Rythme de la période : trois petites cases faciles à lire
const PaceRows: React.FC<{ spent: number; amount: number; range: { start: Date; end: Date }; money: (v: number) => string }> = ({ spent, amount, range, money }) => {
  const p = budgetPace(spent, amount, range);
  const over = p.projected > amount;
  const [help, setHelp] = useState(false);
  // « 5 417 CDF » -> nombre en grand, « CDF » en petit : ça tient toujours dans la case
  const split = (v: number): [string, string] => {
    const t = money(v).trim();
    const after = t.match(/^(.*\d)[\s\u00a0\u202f]*([^\d\s\u00a0\u202f].*)$/); // « 5 417 CDF », « 19 $US »
    if (after) return [after[1], after[2]];
    const before = t.match(/^([^\d\s\u00a0\u202f-]+)[\s\u00a0\u202f]*(.*\d)$/); // « $ 19 »
    if (before) return [before[2], before[1]];
    return [t, ''];
  };
  const tile = (label: [string, string], value: number | string, tone = 'text-slate-900') => {
    let [num, unit] = typeof value === 'number' ? split(value) : [value, ''];
    // Très grands montants : « 14,6 M » (un million et plus) pour tenir dans la case
    if (typeof value === 'number' && Math.abs(value) >= 1e6) num = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    const approx = typeof value === 'number' && Math.round(value) !== 0;
    return (
      <div className="rounded-2xl bg-slate-100 px-2.5 py-3 min-w-0 flex flex-col gap-1.5">
        <div className="text-[12px] leading-tight font-medium text-slate-500">
          <span className="block truncate">{label[0]}</span>
          <span className="block truncate">{label[1]}</span>
        </div>
        <div className={`min-w-0 ${tone}`}>
          <div className={`font-bold tabular-nums leading-tight whitespace-nowrap ${num.length > 9 ? 'text-[12px]' : num.length > 7 ? 'text-[14px]' : 'text-[17px]'}`}>
            {approx && <span className="font-semibold opacity-60 mr-0.5">≈</span>}
            {num}
          </div>
          {unit && <div className="text-[11px] font-semibold opacity-60">{unit}</div>}
        </div>
      </div>
    );
  };
  return (
    <>
      <div className={`grid gap-2 mt-4 ${p.current ? 'grid-cols-3' : 'grid-cols-1'}`}>
        {p.current && tile(['Tu peux', 'par jour'], spent >= amount ? 'Épuisé' : p.perDayAllowed, spent >= amount ? 'text-red-600' : 'text-slate-900')}
        {p.current && tile(['Prévu', 'à la fin'], p.projected, over ? 'text-red-600' : 'text-slate-900')}
        {tile(['Dépensé', 'par jour'], p.perDay)}
      </div>
      {p.current && over && (
        <p className="text-[12px] text-red-600 mt-2">À ce rythme, tu dépasseras de {money(p.projected - amount)}.</p>
      )}
      {/* Petite explication des trois cases, ouverte à la demande */}
      {p.current && (
        <>
          <button
            type="button"
            onClick={() => setHelp((h) => !h)}
            aria-expanded={help}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Que veulent dire ces chiffres ?
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${help ? 'rotate-180' : ''}`} />
          </button>
          <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${help ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <ul className="overflow-hidden text-[12px] leading-snug text-slate-500 space-y-1.5 [&_b]:font-semibold [&_b]:text-slate-700">
              <li className="pt-2"><b>Tu peux par jour</b> : ce que tu peux dépenser chaque jour pour finir sans dépasser.</li>
              <li><b>Prévu à la fin</b> : ce que tu auras dépensé à la fin si tu continues comme maintenant.</li>
              <li><b>Dépensé par jour</b> : ce que tu dépenses en moyenne chaque jour depuis le début.</li>
            </ul>
          </div>
        </>
      )}
    </>
  );
};

// Anneau de progression : vert, puis orange vers 80 %, rouge au-delà de 100 %
const RING_COLOR = (r: number) => (r >= 1 ? '#EF4444' : r >= 0.8 ? '#F59E0B' : '#10B981');
const Ring: React.FC<{ ratio: number }> = ({ ratio }) => {
  const R = 34;
  const C = 2 * Math.PI * R;
  const shown = Math.min(1, Math.max(0, ratio));
  return (
    <div className="relative w-[84px] h-[84px] shrink-0">
      <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
        <circle cx="42" cy="42" r={R} fill="none" strokeWidth="9" className="stroke-slate-100" />
        <circle
          cx="42"
          cy="42"
          r={R}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          stroke={RING_COLOR(ratio)}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - shown)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[17px] font-bold tabular-nums text-slate-900 leading-none">{Math.round(ratio * 100)}<span className="text-[11px]">%</span></span>
        <span className="text-[10px] text-slate-400 mt-0.5">utilisé</span>
      </div>
    </div>
  );
};

const Bar: React.FC<{ ratio: number; big?: boolean }> = ({ ratio, big }) => (
  <div className={`${big ? 'h-2.5 mt-3' : 'h-2 mt-2'} rounded-full bg-slate-100 overflow-hidden`}>
    <div className={`h-full rounded-full animate-bar ${budgetTone(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
  </div>
);

const BudgetIcon: React.FC<{ cat?: Category; size?: 'sm' | 'md' }> = ({ cat, size = 'md' }) =>
  cat ? (
    <IconBadge icon={cat.icon} image={cat.image} color={cat.color} size={size} />
  ) : (
    <span className={`${size === 'md' ? 'w-11 h-11' : 'w-9 h-9'} rounded-full bg-accent flex items-center justify-center shrink-0`}>
      <Layers className="w-5 h-5 text-slate-900" />
    </span>
  );

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-head flex items-center justify-between mb-3">
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
      <div className="mb-3">
        <PaceRows spent={st.spent} amount={b.amount} range={st} money={(v) => formatMoney(Math.round(v), b.currency, { ...getPrefs(), decimals: 'never' })} />
      </div>
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

// Créer / modifier un budget, sur le modèle de l'ajout d'une dépense :
// grand montant + clavier ; « Pour quoi ? » ouvre la liste complète des catégories à la place du clavier
// (rien ne défile en cachette) ; les montants des mois passés se touchent pour remplir.
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

const BudgetSheet: React.FC<{
  budget: Budget | null;
  draft?: BudgetDraft | null; // proposé par un conseil : catégorie et montant déjà choisis
  budgets: Budget[];
  defaultPeriod: BudgetPeriod;
  categories: Category[];
  transactions: Transaction[];
  settings: Settings;
  onClose: () => void;
  onSave: (b: Omit<Budget, 'id' | 'createdAt'>) => void;
}> = ({ budget, draft, budgets, defaultPeriod, categories, transactions, settings, onClose, onSave }) => {
  const [categoryId, setCategoryId] = useState<string | null | undefined>(budget ? budget.categoryId : draft?.categoryId);
  const [amount, setAmount] = useState(budget ? String(budget.amount) : draft ? String(draft.amount) : '');
  const [panel, setPanel] = useState<'category' | 'period' | null>(budget || draft ? null : 'category'); // nouveau : d'abord la catégorie
  const picking = panel === 'category';
  const setPicking = (on: boolean | ((x: boolean) => boolean)) => setPanel((p) => ((typeof on === 'function' ? on(p === 'category') : on) ? 'category' : null));
  const [period, setPeriod] = useState<BudgetPeriod>(budget ? periodOf(budget) : defaultPeriod);
  const [from, setFrom] = useState(budget?.from ?? '');
  const [to, setTo] = useState(budget?.to ?? '');
  const [customDraft, setCustomDraft] = useState(period === 'custom');
  // Une catégorie n'a qu'un budget par période (semaine, mois…) ; les budgets personnalisés sont libres
  const taken = period === 'custom' ? [] : budgets.filter((b) => b.id !== budget?.id && periodOf(b) === period).map((b) => b.categoryId);
  const periodInfo = PERIODS.find((p) => p.id === period)!;
  const customOk = period !== 'custom' || (!!from && !!to && to >= from);
  const currency = budget?.currency ?? settings.mainCurrency;
  // Catégories principales de dépenses pas encore budgétées (+ celle du budget modifié)
  const choices = categories.filter(
    (c) => !c.parentId && (c.type === 'expense' || (c.type === 'debt' && c.direction === 'out')) && (!taken.includes(c.id) || c.id === budget?.categoryId)
  );
  const globalFree = !taken.includes(null) || budget?.categoryId === null;
  const cat = categories.find((c) => c.id === categoryId);
  const past = categoryId !== undefined ? pastSpending(categoryId, transactions, categories, settings, period, { from, to }) : null;
  const value = parseFloat(amount) || 0;
  const valid = categoryId !== undefined && value > 0 && customOk && !taken.includes(categoryId ?? null);
  const save = () =>
    valid &&
    onSave({ categoryId: categoryId ?? null, amount: value, currency, period, from: period === 'custom' ? from : undefined, to: period === 'custom' ? to : undefined });

  const press = (k: string) => {
    haptic();
    setAmount((a) => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.' && a.includes('.')) return a;
      if (a.includes('.') && a.split('.')[1].length >= 2) return a;
      if (k === '.' && a === '') return '0.';
      if (a.replace('.', '').length >= 12) return a;
      return a === '0' && k !== '.' ? k : a + k;
    });
  };

  // Clavier physique (ordinateur)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return panel && categoryId !== undefined ? setPanel(null) : onClose();
      if (panel) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === '.' || e.key === ',') press('.');
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') save();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Montant affiché avec des espaces entre les milliers (« 150 000 »)
  const [int, dec] = amount.split('.');
  const shown = amount ? `${Number(int || 0).toLocaleString('fr-FR')}${dec !== undefined ? `,${dec}` : ''}` : '0';

  const pick = (id: string | null) => {
    haptic();
    setCategoryId(id);
    setPicking(false);
  };
  const tile = (id: string | null, label: string, icon: React.ReactNode) => (
    <button
      key={id ?? 'all'}
      onClick={() => pick(id)}
      className={`relative min-w-0 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-2xl cursor-pointer transition ${
        categoryId === id ? 'is-selected' : 'bg-slate-100 hover:bg-slate-200/70'
      }`}
    >
      {categoryId === id && <SelCheck />}
      {icon}
      <span className="w-full text-center text-[12px] font-bold text-slate-900 leading-tight line-clamp-2 break-words hyphens-auto" lang="fr">
        {label}
      </span>
    </button>
  );
  const suggestion = (label: string, v: number) =>
    v > 0 && (
      <button
        onClick={() => {
          haptic();
          setAmount(String(roundBudget(v)));
        }}
        className="flex-1 min-w-0 px-3 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-left cursor-pointer"
      >
        <span className="block text-[11px] font-semibold text-slate-500">{label}</span>
        <span className="block text-xs font-bold tabular-nums text-slate-900 truncate">{formatMoney(roundBudget(v), currency)}</span>
      </button>
    );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-[420px] max-h-[100dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[32px] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Fermer" className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
          <h2 className="flex-1 text-base font-bold text-center pr-10">{budget ? 'Modifier le budget' : 'Nouveau budget'}</h2>
        </div>

        {/* Montant */}
        <div className="flex flex-col items-center pt-3 pb-2">
          <div className="flex items-baseline gap-2">
            <span className={`text-[38px] leading-none font-extrabold tracking-tight tabular-nums ${amount ? 'text-slate-900' : 'text-slate-300'}`}>{shown}</span>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-sm font-bold text-slate-700">{currency}</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{period === 'custom' ? (customOk && from ? `du ${rangeText(budgetRange({ period, from, to }))}` : 'sur la période choisie') : periodInfo.per}</p>
        </div>

        {/* Pour quoi ? */}
        <button
          onClick={() => !budget && setPicking((x) => !x)}
          disabled={!!budget}
          className={`w-full flex items-center gap-2.5 pl-1.5 pr-3 py-2 rounded-2xl text-left transition ${
            picking ? 'is-open' : 'bg-slate-100'
          } ${budget ? 'cursor-default' : 'cursor-pointer hover:bg-slate-200/70'}`}
        >
          {categoryId === undefined ? <span className="w-9 h-9 rounded-full bg-slate-200 shrink-0" /> : <BudgetIcon cat={cat} size="sm" />}
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] font-semibold text-slate-500">Pour quoi ?</span>
            <span className={`block text-sm font-bold truncate ${categoryId === undefined ? 'text-slate-400' : 'text-slate-900'}`}>
              {categoryId === undefined ? 'Choisis une catégorie' : cat?.name ?? 'Toutes les dépenses'}
            </span>
          </span>
          {!budget && <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${picking ? 'rotate-180' : ''}`} />}
        </button>

        <button
          onClick={() => {
            haptic();
            setPanel((p) => (p === 'period' ? null : 'period'));
          }}
          className={`w-full mt-2 flex items-center gap-2.5 pl-1.5 pr-3 py-2 rounded-2xl text-left cursor-pointer transition ${
            panel === 'period' ? 'is-open' : 'bg-slate-100 hover:bg-slate-200/70'
          }`}
        >
          <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-slate-700" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] font-semibold text-slate-500">Période</span>
            <span className="block text-sm font-bold text-slate-900 truncate">
              {period === 'custom'
                ? customOk && from
                  ? `Du ${rangeText(budgetRange({ period, from, to }))}`
                  : 'Personnalisé : choisis les dates'
                : `${periodInfo.every} · ${rangeText(budgetRange({ period }))}`}
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${panel === 'period' ? 'rotate-180' : ''}`} />
        </button>

        <div className="mt-2 min-h-[300px]">
          {panel === 'period' ? (
            <div className="animate-fade-in space-y-1.5">
              {PERIODS.filter((p) => p.id !== 'custom').map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    haptic();
                    setPeriod(p.id);
                    setCustomDraft(false);
                    setPanel(categoryId === undefined ? 'category' : null);
                  }}
                  className={`relative w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-left cursor-pointer transition ${
                    period === p.id ? 'is-selected' : 'bg-slate-100 hover:bg-slate-200/70'
                  }`}
                >
                  {period === p.id && <SelCheck />}
                  <span>
                    <span className="block text-sm font-bold text-slate-900">
                      {p.now} ({rangeText(budgetRange({ period: p.id }))})
                    </span>
                    <span className="block text-[12px] text-slate-500">Recommence automatiquement {p.every.toLowerCase()}</span>
                  </span>
                </button>
              ))}
              <button
                onClick={() => {
                  haptic();
                  setCustomDraft(true);
                }}
                className={`w-full px-4 py-3 rounded-2xl text-left cursor-pointer transition ${
                  customDraft ? 'is-selected' : 'bg-slate-100 hover:bg-slate-200/70'
                }`}
              >
                <span className="block text-sm font-bold text-slate-900">Personnalisé</span>
                <span className="block text-[12px] text-slate-500">Une seule période : tu choisis les dates</span>
              </button>
              {customDraft && (
                <div className="p-3 rounded-2xl bg-slate-100 animate-fade-in">
                  <div className="text-xs font-semibold text-slate-500 mb-1">Du</div>
                  <DateField value={from} onChange={(d) => { setFrom(d); if (to && d > to) setTo(''); }} shortcuts="start" placeholder="Premier jour" label="Du" />
                  <div className="text-xs font-semibold text-slate-500 mt-3 mb-1">Au</div>
                  <DateField value={to} onChange={setTo} min={from || undefined} placeholder="Dernier jour" label="Au" />
                  <button
                    disabled={!from || !to || to < from}
                    onClick={() => {
                      haptic();
                      setPeriod('custom');
                      setPanel(categoryId === undefined ? 'category' : null);
                    }}
                    className="w-full mt-2 py-2.5 rounded-xl bg-accent text-slate-900 text-sm font-bold cursor-pointer disabled:opacity-40"
                  >
                    Valider ces dates
                  </button>
                </div>
              )}
            </div>
          ) : picking ? (
            <div className="animate-fade-in">
              <p className="text-xs text-slate-500 mb-2">Les sous-catégories comptent dans leur catégorie.</p>
              <div className="grid grid-cols-4 gap-1.5">
                {globalFree && tile(null, 'Toutes les dépenses', <BudgetIcon size="sm" />)}
                {choices.map((c) => tile(c.id, c.name, <IconBadge icon={c.icon} image={c.image} color={c.color} size="sm" />))}
              </div>
            </div>
          ) : (
            <>
              {past && (past.last > 0 || past.average > 0) ? (
                <div className="flex gap-2 mb-2">
                  {suggestion('Mois dernier', past.last)}
                  {suggestion('Moyenne sur 3 mois', past.average)}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center mb-2 py-2">Pas encore de dépenses dans cette catégorie ces derniers mois.</p>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                {KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => press(k)}
                    aria-label={k === 'del' ? 'Effacer' : k}
                    className="h-11 rounded-2xl bg-slate-100 active:bg-slate-200 font-bold text-lg text-slate-800 flex items-center justify-center cursor-pointer"
                  >
                    {k === 'del' ? <Delete className="w-5 h-5" /> : k === '.' ? ',' : k}
                  </button>
                ))}
              </div>
              <button
                disabled={!valid}
                onClick={save}
                className="w-full mt-2 py-3.5 rounded-2xl bg-accent disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 font-bold text-sm cursor-pointer disabled:cursor-default"
              >
                {categoryId === undefined
                  ? 'Choisis une catégorie'
                  : taken.includes(categoryId ?? null)
                    ? 'Cette catégorie a déjà un budget pour cette période'
                    : !customOk
                      ? 'Choisis les dates'
                      : !(value > 0)
                        ? 'Saisis un montant'
                        : `Enregistrer ${formatMoney(value, currency)}${period === 'custom' ? '' : ` ${periodInfo.per}`}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
