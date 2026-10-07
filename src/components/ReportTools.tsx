import React, { useMemo, useState } from 'react';
import { CalendarDays, ArrowLeftRight, Search, FileText, ChevronRight, ChevronLeft, X, Check, TrendingUp, TrendingDown, Loader2, Lightbulb, Flame, Coins, Equal, ArrowUp, ArrowDown, ArrowDownLeft, ArrowUpRight, PiggyBank, CalendarRange, Sparkles, Clock, Repeat } from 'lucide-react';
import { Budget, Recurring, Settings, Transaction, Wallet } from '../types';
import { SmallTool, SubsTool, WeekTool, WhenTool, YearTool } from './MoneyReviews';
import { track } from '../lib/usage';
import { Category } from '../data/categories';
import { formatMoney, toMain } from '../lib/money';
import { getPrefs } from '../lib/display';
import { compareMonths, dayKey, habits, monthDays, monthName, shortMonth } from '../lib/insights';
import { budgetStatus, existedIn, budgetRange, periodOf } from '../lib/budgets';
import { goalInsight } from '../lib/goals';
import { useProfile } from '../lib/profile';
import { IconBadge } from './AppIcon';
import { TransactionItem } from './TransactionItem';
import { Amount, splitMoney } from './MoneyText';
import type { Page } from './BottomNav';

// Outils du Rapport : bilans, « Mes habitudes » (ce qui revient, quand, petites dépenses),
// calendrier des dépenses, comparer deux mois, rapport PDF.

type Tool = 'calendar' | 'compare' | 'habits' | 'pdf' | 'week' | 'year' | 'subs';
type HabitTab = 'what' | 'when' | 'small';

export interface ReportPdfData {
  title: string;
  periodLabel: string;
  scope: string;
  income: number;
  expense: number;
  opening: number;
  closing: number;
  expenseSlices: { name: string; color: string; amount: number }[];
  transactions: Transaction[]; // opérations de la période
}

export const ReportTools: React.FC<{
  txs: Transaction[]; // opérations qui comptent dans le rapport (portefeuille choisi), toutes périodes
  allTransactions: Transaction[];
  wallets: Wallet[];
  budgets: Budget[];
  categories: Category[];
  settings: Settings;
  pdf: ReportPdfData;
  onSelectTransaction: (tx: Transaction) => void;
  onNavigate?: (page: Page) => void;
  recurrings?: Recurring[]; // pour reconnaître les abonnements déjà dans « À venir »
}> = (props) => {
  const [tool, setTool] = useState<Tool | null>(null);
  type Row = { id: Tool; title: string; sub: string; Icon: typeof CalendarDays; color: string };
  // Comprendre son argent : bilans et analyses
  const understand: Row[] = [
    { id: 'week', title: 'Bilan de la semaine', sub: 'Ta semaine en chiffres, ton jour le plus cher', Icon: CalendarRange, color: '#10B981' },
    { id: 'year', title: 'Bilan de l\u2019année', sub: 'Ton année en résumé, à partager', Icon: Sparkles, color: '#EC4899' },
    { id: 'habits', title: 'Mes habitudes', sub: 'Ce qui revient, quand, et les petites dépenses', Icon: Search, color: '#F59E0B' },
    { id: 'subs', title: 'Abonnements repérés', sub: 'Ce qui revient chaque mois', Icon: Repeat, color: '#14B8A6' },
  ];
  const rows: Row[] = [
    { id: 'calendar', title: 'Calendrier des dépenses', sub: 'Jour par jour, les jours qui coûtent cher', Icon: CalendarDays, color: '#0EA5E9' },
    { id: 'compare', title: 'Comparer deux mois', sub: 'Ce qui a augmenté, ce qui a baissé', Icon: ArrowLeftRight, color: '#8B5CF6' },
    { id: 'pdf', title: 'Rapport PDF', sub: 'À imprimer ou à envoyer', Icon: FileText, color: '#EF4444' },
  ];
  const all = [...understand, ...rows];
  const list = (title: string, items: Row[]) => (
    <>
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-2 mt-1 px-1">{title}</h3>
      <div data-coach={title === 'Comprendre mon argent' ? 'insights' : undefined} className="bg-white rounded-3xl border border-slate-100 overflow-hidden divide-y divide-slate-100 mb-4">
        {items.map((r) => (
          <button key={r.id} onClick={() => { track(`tool.${r.id}`); setTool(r.id); }} className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${r.color}1f`, color: r.color }}>
              <r.Icon className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-slate-900">{r.title}</span>
              <span className="block text-[12px] text-slate-500 truncate">{r.sub}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
          </button>
        ))}
      </div>
    </>
  );
  return (
    <>
      {list('Comprendre mon argent', understand)}
      {list('Outils', rows)}
      {tool && (
        <ToolSheet onClose={() => setTool(null)} title={all.find((r) => r.id === tool)!.title}>
          {tool === 'week' && <WeekTool txs={props.txs} settings={props.settings} categories={props.categories} />}
          {tool === 'year' && <YearTool txs={props.txs} settings={props.settings} categories={props.categories} />}
          {tool === 'subs' && (
            <SubsTool
              txs={props.txs}
              settings={props.settings}
              categories={props.categories}
              recurrings={props.recurrings ?? []}
              onNavigate={props.onNavigate ? (p) => { setTool(null); props.onNavigate!(p); } : undefined}
            />
          )}
          {tool === 'calendar' && <CalendarTool {...props} />}
          {tool === 'compare' && <CompareTool {...props} />}
          {tool === 'habits' && <HabitsHub {...props} onClose={() => setTool(null)} />}
          {tool === 'pdf' && <PdfTool {...props} />}
        </ToolSheet>
      )}
    </>
  );
};

// « Mes habitudes » : trois façons de voir où part l'argent, au même endroit
const HABIT_TABS: { id: HabitTab; label: string; Icon: typeof Search }[] = [
  { id: 'what', label: 'Souvent', Icon: Search },
  { id: 'when', label: 'Quand', Icon: Clock },
  { id: 'small', label: 'Petites', Icon: Coins },
];
const HabitsHub: React.FC<React.ComponentProps<typeof ReportTools> & { onClose: () => void }> = (props) => {
  const [tab, setTab] = useState<HabitTab>('what');
  return (
    <>
      <div role="tablist" className="flex gap-1 p-1 rounded-full bg-slate-100 mb-4">
        {HABIT_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              if (id !== 'what') track(`tool.habits.${id}`);
              setTab(id);
            }}
            className={`flex-1 min-w-0 h-9 rounded-full flex items-center justify-center gap-1.5 text-[13px] font-semibold cursor-pointer transition ${
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
      <div key={tab} className="animate-fade-in">
        {tab === 'what' && <HabitsTool {...props} />}
        {tab === 'when' && <WhenTool txs={props.txs} settings={props.settings} />}
        {tab === 'small' && <SmallTool txs={props.txs} settings={props.settings} categories={props.categories} />}
      </div>
    </>
  );
};

const ToolSheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="w-full sm:max-w-[460px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-head flex items-center justify-between mb-3">
        <h2 className="text-[20px] font-bold tracking-tight text-slate-900">{title}</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const useMoney = (settings: Settings) => {
  const main = settings.mainCurrency;
  return {
    money: (v: number) => formatMoney(v, main),
    round: (v: number) => formatMoney(Math.round(v), main, { ...getPrefs(), decimals: 'never' }),
    // « 12 k » sous chaque jour du calendrier
    tiny: (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} M` : v >= 1000 ? `${Math.round(v / 1000)} k` : String(Math.round(v))),
  };
};

const MonthNav: React.FC<{ y: number; m: number; onChange: (y: number, m: number) => void; canNext: boolean }> = ({ y, m, onChange, canNext }) => (
  <div className="flex items-center justify-between bg-slate-100 rounded-full p-1 mb-4">
    <button onClick={() => (m === 0 ? onChange(y - 1, 11) : onChange(y, m - 1))} aria-label="Mois précédent" className="w-9 h-9 rounded-full hover:bg-white flex items-center justify-center cursor-pointer transition">
      <ChevronLeft className="w-4 h-4" />
    </button>
    <span className="text-[15px] font-semibold text-slate-900">{monthName(y, m)}</span>
    <button
      onClick={() => (m === 11 ? onChange(y + 1, 0) : onChange(y, m + 1))}
      disabled={!canNext}
      aria-label="Mois suivant"
      className="w-9 h-9 rounded-full hover:bg-white flex items-center justify-center cursor-pointer transition disabled:opacity-25 disabled:cursor-default"
    >
      <ChevronRight className="w-4 h-4" />
    </button>
  </div>
);

// ---------- Calendrier ----------
const CalendarTool: React.FC<React.ComponentProps<typeof ReportTools>> = ({ txs, settings, onSelectTransaction }) => {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [picked, setPicked] = useState<string | null>(null);
  const { money, round, tiny } = useMoney(settings);
  const cal = useMemo(() => monthDays(txs, settings, ym.y, ym.m), [txs, settings, ym]);
  const weekStart = getPrefs().weekStart;
  const first = new Date(ym.y, ym.m, 1).getDay();
  const lead = (first - weekStart + 7) % 7;
  const heads = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ((weekStart + i) % 7)).toLocaleDateString('fr-FR', { weekday: 'narrow' }));
  const today = dayKey(now);
  const sel = picked ? cal.days.get(picked) : undefined;
  const canNext = ym.y * 12 + ym.m < now.getFullYear() * 12 + now.getMonth();

  return (
    <div>
      <MonthNav y={ym.y} m={ym.m} canNext={canNext} onChange={(y, m) => { setYm({ y, m }); setPicked(null); }} />

      {/* Trois repères : un titre court, la valeur en grand, le détail dessous */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="rounded-2xl bg-slate-100 px-3 py-3 min-w-0 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 leading-tight">Plus cher</span>
          <span className="text-[17px] font-bold text-slate-900 leading-tight whitespace-nowrap">{cal.maxKey ? `${Number(cal.maxKey.slice(8))} ${shortMonth(ym.y, ym.m)}.` : '—'}</span>
          {cal.max > 0 && <span className="text-[11px] font-semibold text-red-500 tabular-nums leading-tight whitespace-nowrap">{tiny(cal.max)} {settings.mainCurrency}</span>}
        </div>
        <div className="rounded-2xl bg-slate-100 px-3 py-3 min-w-0 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 leading-tight">Moyenne / jour</span>
          <Amount text={round(cal.average)} />
        </div>
        <div className="rounded-2xl bg-emerald-500/10 px-3 py-3 min-w-0 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-emerald-700 leading-tight">Sans dépense</span>
          <span className="text-[17px] font-bold text-emerald-600 leading-tight">
            {cal.free} <span className="text-[12px] font-semibold opacity-70">jour{cal.free > 1 ? 's' : ''}</span>
          </span>
          <span className="text-[11px] font-semibold text-emerald-700/70 leading-tight">sur {cal.doneDays}</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {heads.map((h, i) => (
          <span key={i} className="text-[11px] font-semibold text-slate-400 uppercase">{h}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: cal.count }, (_, i) => {
          const d = i + 1;
          const k = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const info = cal.days.get(k);
          const future = d > cal.lastDay;
          const isToday = k === today;
          // Aujourd'hui sans dépense : la journée n'est pas finie, donc pas encore « sans dépense »
          const free = !info && !future && !isToday;
          const strength = info && cal.max ? 0.18 + 0.82 * (info.amount / cal.max) : 0;
          const on = picked === k;
          return (
            <button
              key={k}
              disabled={future}
              onClick={() => setPicked(on ? null : k)}
              className={`flex flex-col items-center gap-0.5 py-1 rounded-xl cursor-pointer transition disabled:cursor-default ${on ? 'bg-slate-200/80' : ''}`}
            >
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold tabular-nums transition ${k === today ? 'ring-2 ring-offset-2 ring-sky-400 ring-offset-white' : ''} ${future ? 'text-slate-300' : ''} ${isToday && !info ? 'bg-slate-100 text-slate-900' : ''}`}
                style={
                  info
                    ? { background: `rgb(239 68 68 / ${strength.toFixed(2)})`, color: strength > 0.55 ? '#fff' : undefined }
                    : free
                      ? { background: 'rgb(16 185 129 / 0.85)', color: '#fff' } // jour sans dépense : rond vert
                      : undefined
                }
              >
                {d}
              </span>
              <span className="h-3 text-[10px] leading-3 tabular-nums">
                {/* Même style pour tous les jours : « 5 k », « 0 » */}
                {info ? <span className="text-slate-500">{tiny(info.amount)}</span> : free ? <span className="text-slate-500">0</span> : isToday ? <span className="text-sky-500 font-semibold">auj.</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: 'rgb(239 68 68 / 0.25)' }} />
          Peu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: 'rgb(239 68 68 / 1)' }} />
          Beaucoup
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: 'rgb(16 185 129 / 0.85)' }} />
          Sans dépense
        </span>
      </div>

      {/* Le jour touché : ses opérations */}
      {picked && (
        <div className="mt-4 animate-fade-in">
          <div className="flex items-baseline justify-between px-1 mb-1.5">
            <span className="text-[14px] font-bold text-slate-900">
              {new Date(`${picked}T12:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <span className="text-[14px] font-bold tabular-nums text-red-500">{sel ? `−${money(sel.amount)}` : ''}</span>
          </div>
          {sel ? (
            <div className="rounded-2xl bg-slate-100 px-2 divide-y divide-slate-200/70">
              {sel.txs.map((t) => (
                <TransactionItem key={t.id} transaction={t} onClick={onSelectTransaction} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-emerald-500/10 text-emerald-700 text-[14px] font-semibold px-4 py-3 flex items-center gap-2">
              <Check className="w-4 h-4" /> Aucune dépense ce jour-là. Bravo !
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ---------- Comparer deux mois ----------
const CompareTool: React.FC<React.ComponentProps<typeof ReportTools>> = ({ txs, settings, categories }) => {
  const now = new Date();
  const [a, setA] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [b, setB] = useState(now.getMonth() === 0 ? { y: now.getFullYear() - 1, m: 11 } : { y: now.getFullYear(), m: now.getMonth() - 1 });
  const { round } = useMoney(settings);
  const c = useMemo(() => compareMonths(txs, settings, categories, a, b), [txs, settings, categories, a, b]);
  const months = Array.from({ length: 25 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const top = Math.max(1, ...c.rows.map((r) => Math.max(r.a, r.b)));
  const diff = c.A.expense - c.B.expense;
  const pct = c.B.expense > 0 ? Math.round((diff / c.B.expense) * 100) : null;
  // « juillet », « août » (en entier dans les phrases)
  const long = (v: { y: number; m: number }) => new Date(v.y, v.m, 1).toLocaleDateString('fr-FR', { month: 'long' });
  const A_COLOR = '#8B5CF6';
  const B_COLOR = 'rgb(148 163 184 / 0.55)';
  const same = Math.abs(diff) < 1;
  const better = diff < 0;
  const tone = same ? '#64748B' : better ? '#10B981' : '#EF4444';

  const picker = (v: { y: number; m: number }, set: (x: { y: number; m: number }) => void, color: string, label: string) => (
    <label className="relative flex-1 min-w-0 rounded-2xl bg-slate-100 px-3 py-2.5 cursor-pointer active:scale-[0.98] transition">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        {label} · {v.y}
      </span>
      <span className="flex items-center gap-1 text-[15px] font-bold text-slate-900">
        <span className="truncate capitalize">{long(v)}</span>
        <ChevronDownIcon />
      </span>
      <select
        aria-label={label}
        value={`${v.y}-${v.m}`}
        onChange={(e) => {
          const [y, m] = e.target.value.split('-').map(Number);
          set({ y, m });
        }}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        {months.map((x) => (
          <option key={`${x.y}-${x.m}`} value={`${x.y}-${x.m}`}>
            {monthName(x.y, x.m)}
          </option>
        ))}
      </select>
    </label>
  );

  // Une ligne par chiffre : le mois A en grand, le mois B dessous, et l'écart en mots (vert = bonne nouvelle)
  const line = (label: string, Icon: typeof TrendingUp, x: number, y: number, goodWhenUp: boolean) => {
    const d = x - y;
    const flat = Math.abs(d) < 1;
    const good = flat ? null : goodWhenUp ? d > 0 : d < 0;
    const col = good === null ? '#64748B' : good ? '#10B981' : '#EF4444';
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-9 h-9 rounded-full bg-slate-200/70 flex items-center justify-center shrink-0 text-slate-600">
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-slate-500">{label}</div>
          <div className={`text-[17px] font-bold tabular-nums leading-tight ${x < 0 ? 'text-red-500' : 'text-slate-900'}`}>{round(x)}</div>
          <div className="text-[12px] text-slate-400 tabular-nums">
            en {long(b)} : {round(y)}
          </div>
        </div>
        <span className="shrink-0 text-right">
          <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-[12px] font-bold tabular-nums" style={{ background: `${col}1f`, color: col }}>
            {flat ? <Equal className="w-3 h-3" /> : d > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {flat ? 'Pareil' : round(Math.abs(d))}
          </span>
          {!flat && <span className="block text-[11px] font-semibold mt-0.5" style={{ color: col }}>{d > 0 ? 'en plus' : 'en moins'}</span>}
        </span>
      </div>
    );
  };

  return (
    <div>
      {/* Les deux mois, avec « vs » entre eux */}
      <div className="flex items-center gap-2 mb-4">
        {picker(a, setA, A_COLOR, 'Mois A')}
        <span className="text-[12px] font-bold text-slate-400 shrink-0">vs</span>
        {picker(b, setB, '#94A3B8', 'Mois B')}
      </div>
      {/* Raccourcis : le mois d'avant, ou le même mois l'an dernier */}
      <div className="flex gap-1.5 -mt-2 mb-4">
        {[
          { label: 'Le mois d\u2019avant', v: a.m === 0 ? { y: a.y - 1, m: 11 } : { y: a.y, m: a.m - 1 } },
          { label: 'Le même mois l\u2019an dernier', v: { y: a.y - 1, m: a.m } },
        ].map(({ label, v }) => {
          const on = b.y === v.y && b.m === v.m;
          return (
            <button
              key={label}
              onClick={() => setB(v)}
              aria-pressed={on}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition ${on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Le résultat en grand */}
      <div className="rounded-3xl p-5 mb-4 text-center" style={{ background: `${tone}14` }}>
        <span className="inline-flex w-12 h-12 rounded-full items-center justify-center mb-2" style={{ background: `${tone}26`, color: tone }}>
          {same ? <Equal className="w-6 h-6" /> : better ? <TrendingDown className="w-6 h-6" /> : <TrendingUp className="w-6 h-6" />}
        </span>
        <div className="text-[26px] font-bold tracking-tight tabular-nums leading-tight" style={{ color: tone }}>
          {same ? 'Pareil' : round(Math.abs(diff))}
        </div>
        <p className="text-[15px] font-semibold mt-0.5" style={{ color: tone }}>
          {same ? '' : `de dépenses ${better ? 'en moins' : 'en plus'}${pct !== null ? ` (${Math.abs(pct)} %)` : ''}`}
        </p>
        <p className="text-[14px] text-slate-600 mt-1 leading-snug [text-wrap:pretty]">
          {same
            ? `Tu as dépensé autant en ${long(a)} qu'en ${long(b)}.`
            : better
              ? `Tu as moins dépensé en ${long(a)} qu'en ${long(b)}. Bien joué !`
              : `Tu as plus dépensé en ${long(a)} qu'en ${long(b)}.`}
        </p>
        {c.biggest && Math.abs(c.biggest.diff) >= 1 && !same && (
          <p className="text-[13px] text-slate-500 mt-2">
            Surtout « {c.biggest.name} » : {round(Math.abs(c.biggest.diff))} {c.biggest.diff > 0 ? 'en plus' : 'en moins'}
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden mb-2">
        {line('Revenus', ArrowDownLeft, c.A.income, c.B.income, true)}
        {line('Dépenses', ArrowUpRight, c.A.expense, c.B.expense, false)}
        {line('Épargne', PiggyBank, c.A.saved, c.B.saved, true)}
      </div>
      <p className="text-[12px] text-slate-400 px-4 mb-5 flex items-center gap-3">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> bonne nouvelle</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> à surveiller</span>
      </p>

      {/* Par catégorie : deux barres fines, la différence à droite */}
      <div className="flex items-center justify-between px-4 mb-1.5">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Par catégorie</h3>
        <span className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: A_COLOR }} />{long(a)}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: B_COLOR }} />{long(b)}</span>
        </span>
      </div>
      {c.rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Aucune dépense sur ces deux mois.</p>
      ) : (
        <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
          {c.rows.map((r) => {
            const up = r.diff > 0.5;
            const down = r.diff < -0.5;
            return (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center gap-2.5 mb-2">
                  <IconBadge icon={r.icon} image={r.image} color={r.color} size="sm" />
                  <span className="flex-1 min-w-0 text-[14px] font-semibold text-slate-900 leading-tight line-clamp-2 break-words">{r.name}</span>
                  <span
                    className="shrink-0 inline-flex items-center gap-0.5 px-2 h-6 rounded-full text-[12px] font-bold tabular-nums"
                    style={{ background: up ? '#EF44441f' : down ? '#10B9811f' : 'rgb(148 163 184 / 0.15)', color: up ? '#EF4444' : down ? '#10B981' : '#94A3B8' }}
                  >
                    {up ? <ArrowUp className="w-3 h-3" /> : down ? <ArrowDown className="w-3 h-3" /> : null}
                    {!up && !down ? 'Pareil' : `${round(Math.abs(r.diff))} ${up ? 'en plus' : 'en moins'}`}
                  </span>
                </div>
                {(
                  [
                    [r.a, A_COLOR],
                    [r.b, B_COLOR],
                  ] as const
                ).map(([v, col], i) => (
                  <div key={i} className="flex items-center gap-2 mt-1.5 pl-[46px]">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200/60 overflow-hidden">
                      <div className="h-full rounded-full animate-bar" style={{ width: `${(v / top) * 100}%`, background: col }} />
                    </div>
                    <span className={`w-20 text-right text-[12px] tabular-nums ${i === 0 ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{round(v)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ChevronDownIcon = () => <ChevronRight className="w-3.5 h-3.5 rotate-90 text-slate-400 shrink-0" />;

// ---------- Où part mon argent ? ----------
const HabitsTool: React.FC<React.ComponentProps<typeof ReportTools> & { onClose: () => void }> = ({ txs, settings, categories, onNavigate, onClose }) => {
  const { round } = useMoney(settings);
  const h = useMemo(() => {
    const r = habits(txs, settings, categories);
    // Couleurs en double (catégories grises…) : une couleur différente pour chacune, sinon la barre est illisible
    const PALETTE = ['#0EA5E9', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981', '#EF4444', '#6366F1', '#14B8A6'];
    const seen = new Set<string>();
    r.categories = r.categories.map((c, i) => {
      const col = seen.has(c.color.toLowerCase()) ? PALETTE[i % PALETTE.length] : c.color;
      seen.add(col.toLowerCase());
      return { ...c, color: col };
    });
    return r;
  }, [txs, settings, categories]);
  const medal = ['#F59E0B', '#94A3B8', '#B45309'];
  return (
    <div>
      <p className="text-[14px] text-slate-500 mb-4 leading-snug">Sur les 30 derniers jours, les dépenses qui reviennent le plus souvent, et ce qu'elles coûtent sur une année.</p>

      {h.top.length === 0 ? (
        <div className="rounded-2xl bg-slate-100 p-5 text-center">
          <Coins className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-slate-700">Pas encore d'habitude repérée</p>
          <p className="text-[13px] text-slate-500 mt-1">Une dépense doit revenir au moins 3 fois en 30 jours pour apparaître ici.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {h.top.map((x, i) => (
            <div key={x.id} className="rounded-3xl bg-slate-100 p-4 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center gap-3">
                <span className="relative">
                  <IconBadge icon={x.icon} image={x.image} color={x.color} size="md" />
                  <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full text-[11px] font-extrabold flex items-center justify-center ring-2 ring-slate-100" style={{ background: medal[i], color: '#fff' }}>
                    {i + 1}
                  </span>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-bold text-slate-900 truncate">{x.name}</div>
                  <div className="text-[12px] text-slate-500">
                    {x.count} fois · ≈ {round(x.average)} à chaque fois
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-2xl bg-white px-3 py-2.5 min-w-0 flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-slate-500">En 30 jours</div>
                  <Amount text={round(x.total)} size="lg" />
                </div>
                <div className="rounded-2xl bg-red-500/10 px-3 py-2.5 min-w-0 flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-red-500 flex items-center gap-1">
                    <Flame className="w-3 h-3" /> Sur un an
                  </div>
                  <Amount text={round(x.yearly)} size="lg" prefix="≈" tone="#EF4444" />
                </div>
              </div>
              <p className="mt-3 text-[13px] text-slate-600 leading-snug flex gap-2 [text-wrap:pretty]">
                <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                En dépensant 25 % de moins ici, tu garderais ≈ {round(x.yearly * 0.25)} par an.
              </p>
            </div>
          ))}
        </div>
      )}

      {h.categories.length > 0 && (
        <>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 mt-6 px-4">Répartition (30 jours)</h3>
          <div className="rounded-2xl bg-slate-100 px-4 py-3 space-y-3">
            {/* Une barre empilée, puis le détail */}
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {h.categories.map((c) => (
                <span key={c.id} style={{ width: `${(c.amount / h.total) * 100}%`, background: c.color }} />
              ))}
            </div>
            {h.categories.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="flex-1 min-w-0 text-[13px] text-slate-700 truncate">{c.name}</span>
                <span className="text-[12px] text-slate-400 tabular-nums">{Math.round((c.amount / h.total) * 100)} %</span>
                <span className="w-24 text-right text-[13px] font-bold tabular-nums text-slate-900">{round(c.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {onNavigate && h.top.length > 0 && (
        <button
          onClick={() => {
            onClose();
            onNavigate('budgets');
          }}
          className="mt-6 w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold cursor-pointer transition active:scale-[0.98]"
        >
          Créer un budget pour ça
        </button>
      )}
    </div>
  );
};

// ---------- Rapport PDF ----------
const PdfTool: React.FC<React.ComponentProps<typeof ReportTools>> = ({ pdf, wallets, budgets, allTransactions, categories, settings }) => {
  const [withTxs, setWithTxs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { money } = useMoney(settings);
  const { name } = useProfile();

  const make = async () => {
    setBusy(true);
    setDone(null);
    try {
      const { buildReportPdf, sharePdf } = await import('../lib/pdfReport');
      const net = pdf.income - pdf.expense;
      const today = new Date();
      const live = budgets.filter((b) => existedIn(b, budgetRange(b, 0, today)) && periodOf(b) !== 'custom');
      const blob = await buildReportPdf({
        title: pdf.title,
        person: name || 'Mon compte',
        scope: pdf.scope,
        generated: today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
        summary: [
          { label: 'Revenus', value: `+${money(pdf.income)}`, tone: 'good' },
          { label: 'Dépenses', value: `-${money(pdf.expense)}`, tone: 'bad' },
          { label: 'Revenu net', value: `${net >= 0 ? '+' : '-'}${money(Math.abs(net))}`, tone: net >= 0 ? 'good' : 'bad' },
          { label: 'Solde de fin', value: money(pdf.closing) },
        ],
        categories: pdf.expenseSlices.map((s) => ({ name: s.name, color: s.color, value: money(s.amount), share: pdf.expense > 0 ? s.amount / pdf.expense : 0 })),
        budgets: live.map((b) => {
          const st = budgetStatus(b, allTransactions, categories, settings, 0, today);
          const nm = b.categoryId ? categories.find((c) => c.id === b.categoryId)?.name ?? 'Budget' : 'Toutes les dépenses';
          return { name: nm, value: `${formatMoney(st.spent, b.currency)} / ${formatMoney(b.amount, b.currency)}`, ratio: st.ratio };
        }),
        goals: wallets
          .filter((w) => w.kind === 'goal' && !w.archived && w.goalAmount)
          .map((w) => {
            const g = goalInsight(w, allTransactions);
            return { name: w.name, value: `${formatMoney(g?.saved ?? 0, w.currency)} / ${formatMoney(w.goalAmount!, w.currency)}`, ratio: g?.ratio ?? 0 };
          }),
        transactions: withTxs
          ? [...pdf.transactions]
              .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
              .map((t) => {
                const v = toMain(t.amount, t.currency, settings);
                return {
                  date: new Date(t.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
                  title: t.title,
                  category: t.category,
                  value: `${v >= 0 ? '+' : '-'}${money(Math.abs(v))}`,
                  positive: v >= 0,
                };
              })
          : undefined,
      });
      const file = `wallo-rapport-${pdf.periodLabel.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}.pdf`;
      const res = await sharePdf(blob, file, pdf.title);
      setDone(res === 'shared' ? 'Rapport envoyé.' : res === 'downloaded' ? 'Rapport téléchargé.' : null);
    } catch {
      setDone("Le PDF n'a pas pu être créé. Réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Aperçu de la première page */}
      <div className="rounded-3xl bg-slate-100 p-4 mb-4">
        <div className="mx-auto w-44 aspect-[210/297] rounded-lg bg-white shadow-lg overflow-hidden flex flex-col" style={{ background: '#fff' }}>
          <div className="h-10 px-2.5 py-1.5" style={{ background: '#0f172a' }}>
            <div className="text-[6px] font-bold" style={{ color: '#D8FB52' }}>Wallo</div>
            <div className="text-[8px] font-bold text-white truncate">{pdf.title}</div>
          </div>
          <div className="grid grid-cols-2 gap-1 p-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-5 rounded" style={{ background: '#f1f5f9' }} />
            ))}
          </div>
          <div className="px-2 space-y-1.5">
            {pdf.expenseSlices.slice(0, 5).map((s) => (
              <div key={s.name} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 h-1 rounded-full" style={{ background: '#f1f5f9' }}>
                  <span className="block h-1 rounded-full" style={{ width: `${pdf.expense ? (s.amount / pdf.expense) * 100 : 0}%`, background: s.color }} />
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-[13px] font-semibold text-slate-700 mt-3">{pdf.title}</p>
        <p className="text-center text-[12px] text-slate-500">{pdf.scope}</p>
      </div>

      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden mb-2">
        {['Revenus, dépenses et soldes', 'Dépenses par catégorie', 'Budgets et objectifs'].map((l) => (
          <div key={l} className="flex items-center gap-3 px-4 min-h-[44px]">
            <Check className="w-4 h-4 text-emerald-500" />
            <span className="text-[14px] text-slate-700">{l}</span>
          </div>
        ))}
        <button type="button" onClick={() => setWithTxs((v) => !v)} className="w-full flex items-center gap-3 px-4 min-h-[48px] text-left cursor-pointer">
          <span className="flex-1 text-[14px] text-slate-700">Liste des opérations ({pdf.transactions.length})</span>
          <span role="switch" aria-checked={withTxs} className={`w-[51px] h-[31px] shrink-0 rounded-full p-0.5 transition-colors duration-200 ${withTxs ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span style={{ background: '#fff' }} className={`block w-[27px] h-[27px] rounded-full shadow transition-transform duration-200 ${withTxs ? 'translate-x-5' : ''}`} />
          </span>
        </button>
      </div>
      <p className="text-[12px] text-slate-400 px-4 mb-5">Le PDF est créé sur ton téléphone, même sans internet. La période est celle choisie dans le Rapport.</p>

      <button
        onClick={make}
        disabled={busy}
        className="w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover disabled:opacity-60 text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {busy ? 'Création du PDF…' : 'Créer et partager le PDF'}
      </button>
      {done && <p className="text-center text-[13px] font-semibold text-emerald-600 mt-3 animate-fade-in">{done}</p>}
    </div>
  );
};
