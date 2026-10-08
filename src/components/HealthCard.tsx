import React, { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../lib/usage';
import { setBudgetDraft } from '../lib/budgetDraft';
import { requestNewGoal } from '../lib/goalMilestones';
import { requestJump } from '../lib/jumpTo';
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Lightbulb,
  PiggyBank,
  PieChart,
  HandCoins,
  Shield,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  X,
  HeartPulse,
  Check,
  ArrowRight,
  Flame,
  CalendarClock,
  SearchCheck,
  Target,
} from 'lucide-react';
import { Budget, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';
import { debtsSummary } from '../lib/debts';
import { computeHealth, Health, HEALTH_COLOR, HealthAction, HealthPart, HealthPartId, HealthTip, rememberScore, TONE_COLOR, weeklyTipIndex } from '../lib/health';
import { IconBadge } from './AppIcon';
import type { SharedDebts } from './DebtsView';
import type { Page } from './BottomNav';

// Santé financière sur l'accueil : une note sur 100, le conseil de la semaine,
// et en touchant : le détail de chaque partie de la note et de chaque conseil.

const PART_ICON: Record<HealthTip['part'], typeof PiggyBank> = {
  savings: PiggyBank,
  budgets: PieChart,
  debts: HandCoins,
  cushion: Shield,
  regular: CalendarCheck,
  trend: Flame,
  forecast: CalendarClock, // prévisions (budget qui va déborder, fin de mois)
  check: SearchCheck, // vérifications (solde négatif, doublon…)
  goal: Target, // objectifs en retard
};

const partTone = (p: HealthPart) => {
  const r = p.points / p.max;
  return r >= 0.75 ? TONE_COLOR.good : r >= 0.45 ? TONE_COLOR.warn : TONE_COLOR.bad;
};
const partWord = (p: HealthPart) => {
  const r = p.points / p.max;
  return r >= 1 ? 'Parfait' : r >= 0.75 ? 'Très bien' : r >= 0.45 ? 'Moyen' : 'À travailler';
};

const Ring: React.FC<{ value: number; max?: number; color: string; size: number; stroke: number; children?: React.ReactNode }> = ({ value, max = 100, color, size, stroke, children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // L'anneau se remplit à l'ouverture
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-100" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, shown / max))}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
};

const Delta: React.FC<{ d: number | null }> = ({ d }) => {
  if (d === null || d === 0) return null;
  const up = d > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-emerald-600' : 'text-amber-600'}`}>
      <Icon className="w-3 h-3" /> {up ? '+' : ''}
      {d}
    </span>
  );
};

export const HealthCard: React.FC<{
  transactions: Transaction[];
  wallets: Wallet[];
  budgets: Budget[];
  categories: Category[];
  settings: Settings;
  shared?: SharedDebts;
  onNavigate?: (page: Page) => void;
  compact?: boolean; // tuile à côté de la série (accueil)
  onSelectTransaction?: (tx: Transaction) => void; // conseil « Un doublon ? » : ouvrir l'opération
}> = ({ transactions, wallets, budgets, categories, settings, shared, onNavigate, compact, onSelectTransaction }) => {
  const [open, setOpen] = useState(false);
  const health = useMemo(() => {
    const money = (v: number) => formatMoney(Math.round(v), settings.mainCurrency, { ...getPrefs(), decimals: 'never' });
    const debts = debtsSummary(transactions, settings, shared?.shares, shared?.me);
    return computeHealth({ transactions, wallets, budgets, categories, settings, debts, money });
  }, [transactions, wallets, budgets, categories, settings, shared?.shares, shared?.me]);
  const delta = useMemo(() => (health ? rememberScore(health.score) : null), [health]);

  if (!health && compact)
    return (
      <div className="w-full h-full bg-white rounded-3xl border border-slate-100 p-4 flex flex-col gap-3">
        <span className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
          <HeartPulse className="w-6 h-6 text-rose-500" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-slate-900 leading-tight">Ta santé</span>
          <span className="block text-[12px] text-slate-500 leading-snug mt-0.5">Ta note apparaîtra après quelques opérations.</span>
        </span>
      </div>
    );
  if (!health) {
    // Pas encore assez d'opérations : on explique, sans note
    return (
      <div className="w-full bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
          <HeartPulse className="w-5 h-5 text-rose-500" />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-slate-900">Santé financière</div>
          <div className="text-[13px] text-slate-500 leading-snug">Note quelques dépenses et revenus : ta note sur 100 apparaîtra ici.</div>
        </div>
      </div>
    );
  }
  const color = HEALTH_COLOR[health.level];
  const openSheet = () => {
    track('home.health');
    setOpen(true);
  };
  return (
    <>
      {compact ? (
        <button
          onClick={openSheet}
          data-coach="health"
          className="w-full h-full text-left bg-white rounded-3xl border border-slate-100 p-4 flex flex-col gap-3 cursor-pointer hover:bg-slate-50 active:scale-[0.98] transition"
        >
          <span className="flex items-start justify-between gap-1">
            <Ring value={health.score} color={color} size={48} stroke={5}>
              <span className="text-[15px] font-bold tabular-nums text-slate-900 leading-none">{health.score}</span>
            </Ring>
            <Delta d={delta} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-slate-900 leading-tight">Ta santé</span>
            <span className="block text-[13px] font-semibold leading-snug mt-0.5" style={{ color }}>
              {health.label}
            </span>
          </span>
        </button>
      ) : (
      <button
        onClick={openSheet}
        data-coach="health"
        className="w-full text-left bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3.5 cursor-pointer hover:bg-slate-50 active:scale-[0.99] transition"
      >
        <Ring value={health.score} color={color} size={56} stroke={6}>
          <span className="text-[17px] font-bold tabular-nums text-slate-900 leading-none">{health.score}</span>
        </Ring>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-slate-900">Santé financière</span>
            <Delta d={delta} />
          </div>
          <div className="text-[13px] font-semibold" style={{ color }}>
            {health.label}
          </div>
          <p className="text-[12px] text-slate-500 leading-snug line-clamp-2 mt-0.5">{health.tips[weeklyTipIndex(health)].text}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </button>
      )}
      {open && (
        <HealthSheet
          health={health}
          delta={delta}
          onClose={() => setOpen(false)}
          onAction={
            onNavigate
              ? (a) => {
                  setOpen(false);
                  setBudgetDraft(a.budget ?? null); // « Créer un budget » : la fiche s'ouvre déjà remplie
                  if (a.goal) requestNewGoal(a.goal); // « Créer un objectif Réserve » : formulaire déjà rempli
                  // L'endroit exact : l'écran visé ouvre ce portefeuille / budget / dette / objectif
                  requestJump(a.jump && a.jump.kind !== 'tx' ? a.jump : null);
                  onNavigate(a.page);
                  // Opération (doublon) : sa fiche arrive par-dessus l'historique, une fois la page affichée
                  const j = a.jump;
                  const tx = j?.kind === 'tx' ? transactions.find((t) => t.id === j.id) : undefined;
                  if (tx && onSelectTransaction) setTimeout(() => onSelectTransaction(tx), 380);
                }
              : undefined
          }
        />
      )}
    </>
  );
};

type View = { kind: 'part'; id: HealthPartId } | { kind: 'tip'; index: number } | null;

const HealthSheet: React.FC<{ health: Health; delta: number | null; onClose: () => void; onAction?: (a: HealthAction) => void }> = ({ health, delta, onClose, onAction }) => {
  const [view, setView] = useState<View>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: 0 }); // chaque vue commence en haut
  }, [view]);
  const part = view?.kind === 'part' ? health.parts.find((p) => p.id === view.id) : undefined;
  const tipIndex = view?.kind === 'tip' ? view.index : -1;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Santé financière"
        ref={box}
        className="w-full sm:max-w-[420px] h-[88dvh] sm:h-auto sm:max-h-[90dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {part ? (
          <PartView key={part.id} part={part} onBack={() => setView(null)} onClose={onClose} onAction={onAction} />
        ) : tipIndex >= 0 ? (
          <TipView
            key={tipIndex}
            health={health}
            index={tipIndex}
            onBack={() => setView(null)}
            onClose={onClose}
            onOpenTip={(i) => setView({ kind: 'tip', index: i })}
            onOpenPart={(id) => setView({ kind: 'part', id })}
            onAction={onAction}
          />
        ) : (
          <Overview health={health} delta={delta} onClose={onClose} onOpen={setView} />
        )}
      </div>
    </div>
  );
};

// ---------- Vue principale ----------
const Overview: React.FC<{ health: Health; delta: number | null; onClose: () => void; onOpen: (v: View) => void }> = ({ health, delta, onClose, onOpen }) => {
  const [how, setHow] = useState(false);
  const color = HEALTH_COLOR[health.level];
  const weekly = weeklyTipIndex(health);
  return (
    <div className="animate-pick-back">
      <div className="sheet-head flex items-center justify-between mb-2">
        <h2 className="text-[22px] font-bold tracking-tight text-slate-900">Santé financière</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center pt-2 pb-5">
        <Ring value={health.score} color={color} size={150} stroke={12}>
          <span className="text-[44px] font-bold tabular-nums tracking-tight text-slate-900 leading-none">{health.score}</span>
          <span className="text-[12px] text-slate-400 mt-1">sur 100</span>
        </Ring>
        <div className="mt-3 text-[17px] font-bold" style={{ color }}>
          {health.label}
        </div>
        {delta !== null && delta !== 0 && (
          <div className="text-[13px] text-slate-500 mt-0.5">
            {delta > 0 ? `+${delta}` : delta} point{Math.abs(delta) > 1 ? 's' : ''} depuis la semaine dernière
          </div>
        )}
      </div>

      {/* Conseil de la semaine : une ligne sobre, le toucher ouvre son détail */}
      <button
        onClick={() => onOpen({ kind: 'tip', index: weekly })}
        className="w-full text-left rounded-3xl bg-slate-100 px-4 py-3.5 mb-5 flex items-center gap-3.5 cursor-pointer active:bg-slate-200/70 transition-colors"
      >
        <span className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
          <Lightbulb className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium text-slate-400">Conseil de la semaine</span>
          <span className="block text-[15px] font-semibold text-slate-900 leading-snug mt-0.5 line-clamp-3 [text-wrap:pretty]">{nb(health.tips[weekly].text)}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </button>

      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-4">Ta note en détail</h3>
      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden mb-3">
        {health.parts.map((p) => {
          const Icon = PART_ICON[p.id];
          const tone = partTone(p);
          return (
            <button key={p.id} onClick={() => onOpen({ kind: 'part', id: p.id })} className="w-full text-left px-4 py-3 cursor-pointer active:bg-slate-200/60 transition-colors">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${tone}1f`, color: tone }}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="flex-1 text-[15px] font-semibold text-slate-900">{p.label}</span>
                <span className="text-[13px] font-bold tabular-nums text-slate-500">
                  {p.points}
                  <span className="font-medium text-slate-400"> / {p.max}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <div className="ml-11 mr-7 mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full rounded-full animate-bar" style={{ width: `${Math.round((p.points / p.max) * 100)}%`, background: tone }} />
              </div>
              <p className="ml-11 mr-7 mt-1.5 text-[13px] text-slate-600 leading-snug">{p.text}</p>
            </button>
          );
        })}
      </div>

      {health.tips.length > 1 && (
        <>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 mt-5 px-4">Tous les conseils</h3>
          <TipList health={health} skip={-1} onOpen={(i) => onOpen({ kind: 'tip', index: i })} />
        </>
      )}

      <button type="button" onClick={() => setHow((v) => !v)} aria-expanded={how} className="mt-3 px-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 cursor-pointer">
        Comment c'est calculé ?
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${how ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${how ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="px-4 pt-2 text-[12px] text-slate-500 leading-snug [text-wrap:pretty]">
            La note additionne cinq parties, sur les 30 derniers jours : ce que tu gardes de tes revenus (30 points), tes budgets tenus (25), tes dettes (20), ta réserve pour les
            imprévus (15) et la régularité de tes notes (10). Elle est calculée sur ton téléphone : tes chiffres ne sont envoyés nulle part. Le conseil change chaque semaine.
          </p>
        </div>
      </div>
    </div>
  );
};

const TipList: React.FC<{ health: Health; skip: number; onOpen: (i: number) => void }> = ({ health, skip, onOpen }) => (
  <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
    {health.tips.map((t, i) => {
      if (i === skip) return null;
      const Icon = PART_ICON[t.part];
      return (
        <button key={i} onClick={() => onOpen(i)} className="w-full text-left flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-slate-200/60 transition-colors">
          <span className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold text-slate-900">{t.title}</span>
            <span className="block text-[12px] text-slate-500 leading-snug line-clamp-2">{nb(t.text)}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      );
    })}
  </div>
);

// En-tête des vues détaillées : ‹ retour, titre, ✕
const DetailHead: React.FC<{ title: string; onBack: () => void; onClose: () => void }> = ({ title, onBack, onClose }) => (
  <div className="sheet-head grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2 mb-4">
    <button onClick={onBack} aria-label="Retour" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
      <ChevronLeft className="w-4 h-4" />
    </button>
    <h2 className="text-[17px] font-bold text-center truncate">{title}</h2>
    <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
      <X className="w-4 h-4" />
    </button>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 mt-5 px-4">{children}</h3>
);

const Stats: React.FC<{ stats: { label: string; value: string; tone?: keyof typeof TONE_COLOR }[] }> = ({ stats }) => (
  <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
    {stats.map((s) => (
      <div key={s.label} className="flex items-center justify-between gap-3 px-4 min-h-[48px]">
        <span className="text-[14px] text-slate-600">{s.label}</span>
        <span className="text-[15px] font-bold tabular-nums whitespace-nowrap" style={{ color: s.tone && s.tone !== 'neutral' ? TONE_COLOR[s.tone] : undefined }}>
          {s.value}
        </span>
      </div>
    ))}
  </div>
);

// Espace insécable avant « : ; ! ? » : jamais de « : » seul en début de ligne
const nb = (t: string) => t.replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

const ActionButton: React.FC<{ action?: HealthAction; onAction?: (a: HealthAction) => void }> = ({ action, onAction }) =>
  action && onAction ? (
    <button
      onClick={() => onAction(action)}
      className="mt-6 w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
    >
      {action.label} <ArrowRight className="w-4 h-4" />
    </button>
  ) : null;

// ---------- Détail d'une partie de la note ----------
const PartView: React.FC<{ part: HealthPart; onBack: () => void; onClose: () => void; onAction?: (a: HealthAction) => void }> = ({ part, onBack, onClose, onAction }) => {
  const Icon = PART_ICON[part.id];
  const tone = partTone(part);
  return (
    <div className="animate-pick-in">
      <DetailHead title={part.label} onBack={onBack} onClose={onClose} />

      {/* En grand : l'anneau des points */}
      <div className="flex flex-col items-center text-center pb-2">
        <Ring value={part.points} max={part.max} color={tone} size={128} stroke={10}>
          <Icon className="w-6 h-6 mb-1" style={{ color: tone }} />
          <span className="text-[28px] font-bold tabular-nums text-slate-900 leading-none">
            {part.points}
            <span className="text-[15px] font-semibold text-slate-400">/{part.max}</span>
          </span>
        </Ring>
        <span className="mt-3 inline-flex items-center px-3 h-7 rounded-full text-[13px] font-bold" style={{ background: `${tone}1f`, color: tone }}>
          {partWord(part)}
        </span>
        <p className="mt-3 text-[17px] font-semibold text-slate-900 leading-snug max-w-[320px] [text-wrap:pretty]">{nb(part.text)}</p>
      </div>

      {/* Un visuel propre à chaque partie */}
      {part.flows && <Flows flows={part.flows} />}
      {part.meter && <Meter meter={part.meter} color={tone} />}
      {part.days && <Days days={part.days} color={tone} />}
      {part.items && part.items.length > 0 && <Items items={part.items} part={part.id} />}

      <SectionTitle>Tes chiffres</SectionTitle>
      <Stats stats={part.stats} />

      {part.tip && (
        <div className="mt-5 rounded-2xl bg-amber-500/10 p-4 flex gap-3">
          <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[14px] text-slate-700 leading-snug [text-wrap:pretty]">{nb(part.tip)}</p>
        </div>
      )}

      <SectionTitle>Comment gagner des points</SectionTitle>
      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
        {part.rules.map((r) => (
          <div key={r.when} className={`flex items-center gap-3 px-4 min-h-[48px] ${r.active ? 'bg-slate-200/60' : ''}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${r.active ? '' : 'border-2 border-slate-300'}`} style={r.active ? { background: tone } : undefined}>
              {r.active && <Check className="w-3 h-3 stroke-[3]" style={{ color: '#fff' }} />}
            </span>
            <span className={`flex-1 text-[14px] ${r.active ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
              {r.when}
              {r.active && <span className="block text-[11px] font-semibold" style={{ color: tone }}>Tu es ici</span>}
            </span>
            <span className={`text-[14px] font-bold tabular-nums ${r.active ? 'text-slate-900' : 'text-slate-400'}`}>{r.points} pts</span>
          </div>
        ))}
      </div>

      <SectionTitle>Pourquoi c'est important</SectionTitle>
      <p className="px-4 text-[14px] text-slate-600 leading-relaxed [text-wrap:pretty]">{nb(part.why)}</p>

      <ActionButton action={part.action} onAction={onAction} />
    </div>
  );
};

// Épargne : deux barres, revenus et dépenses
const Flows: React.FC<{ flows: NonNullable<HealthPart['flows']> }> = ({ flows }) => {
  const top = Math.max(flows.income, flows.expense, 1);
  const bar = (label: string, v: number, text: string, color: string) => (
    <div>
      <div className="flex items-baseline justify-between text-[13px] mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-bold tabular-nums text-slate-900">{text}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full animate-bar" style={{ width: `${(v / top) * 100}%`, background: color }} />
      </div>
    </div>
  );
  return (
    <div className="mt-5 rounded-2xl bg-slate-100 p-4 space-y-3">
      {bar('Ce que tu as gagné', flows.income, flows.incomeText, TONE_COLOR.good)}
      {bar('Ce que tu as dépensé', flows.expense, flows.expenseText, TONE_COLOR.bad)}
    </div>
  );
};

// Réserve : une jauge avec des repères (2 semaines, 1 mois, 3 mois)
const Meter: React.FC<{ meter: NonNullable<HealthPart['meter']>; color: string }> = ({ meter, color }) => (
  <div className="mt-5 rounded-2xl bg-slate-100 p-4">
    <div className="text-[13px] text-slate-600 mb-2">Combien de temps ton argent tiendrait</div>
    <div className="relative h-3 rounded-full bg-slate-200">
      <div className="absolute inset-y-0 left-0 rounded-full animate-bar" style={{ width: `${(meter.value / meter.max) * 100}%`, background: color }} />
      {meter.marks.map((m) => (
        <span key={m.label} className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-slate-400/70" style={{ left: `${(m.at / meter.max) * 100}%` }} />
      ))}
    </div>
    <div className="relative h-5 mt-1.5 text-[11px] text-slate-500">
      {meter.marks.map((m) => (
        <span key={m.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(m.at / meter.max) * 100}%` }}>
          {m.label}
        </span>
      ))}
    </div>
  </div>
);

// Régularité : les 14 derniers jours, un rond par jour
const Days: React.FC<{ days: NonNullable<HealthPart['days']>; color: string }> = ({ days, color }) => (
  <div className="mt-5 rounded-2xl bg-slate-100 p-4">
    <div className="text-[13px] text-slate-600 mb-3">Les 14 derniers jours</div>
    <div className="grid grid-cols-7 gap-y-3 gap-x-1.5">
      {days.map((d) => {
        const date = new Date(`${d.day}T12:00`);
        return (
          <div key={d.day} className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">{date.toLocaleDateString('fr-FR', { weekday: 'narrow' })}</span>
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold tabular-nums ${d.on ? '' : 'bg-white text-slate-400'}`}
              style={d.on ? { background: color, color: '#fff' } : undefined}
            >
              {date.getDate()}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

// Budgets et dettes : une ligne par élément
const Items: React.FC<{ items: NonNullable<HealthPart['items']>; part: HealthPartId }> = ({ items, part }) => (
  <>
    <SectionTitle>{part === 'budgets' ? 'Tes budgets' : 'Ce que tu dois'}</SectionTitle>
    <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
      {items.map((it, i) => {
        const c = TONE_COLOR[it.tone ?? 'neutral'];
        return (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            {it.icon ? (
              <IconBadge icon={it.icon} color={it.color ?? '#64748B'} size="sm" />
            ) : (
              <span className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-[13px] font-bold text-slate-600 shrink-0">{it.name.slice(0, 1).toUpperCase()}</span>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-semibold text-slate-900 truncate">{it.name}</span>
                <span className="text-[14px] font-bold tabular-nums shrink-0" style={{ color: it.tone && it.tone !== 'neutral' ? c : undefined }}>
                  {it.value}
                </span>
              </div>
              {it.ratio !== undefined && (
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full animate-bar" style={{ width: `${Math.min(100, it.ratio * 100)}%`, background: part === 'debts' ? TONE_COLOR.good : c }} />
                </div>
              )}
              {it.sub && <div className="text-[12px] mt-1" style={{ color: it.tone === 'bad' ? c : '#94A3B8' }}>{it.sub}{part === 'debts' && it.ratio !== undefined ? ` · ${Math.round(it.ratio * 100)} % remboursé` : ''}</div>}
            </div>
          </div>
        );
      })}
    </div>
  </>
);

// ---------- Détail d'un conseil ----------
const TipView: React.FC<{
  health: Health;
  index: number;
  onBack: () => void;
  onClose: () => void;
  onOpenTip: (i: number) => void;
  onOpenPart: (id: HealthPartId) => void;
  onAction?: (a: HealthAction) => void;
}> = ({ health, index, onBack, onClose, onOpenTip, onOpenPart, onAction }) => {
  const tip: HealthTip = health.tips[index];
  const weekly = index === weeklyTipIndex(health);
  const part = health.parts.find((p) => p.id === tip.part);
  return (
    <div className="animate-pick-in">
      <DetailHead title={weekly ? 'Conseil de la semaine' : 'Conseil'} onBack={onBack} onClose={onClose} />

      {/* L'ampoule en grand, avec un halo doux */}
      <div className="flex flex-col items-center text-center pb-2">
        {/* Halo en dégradé (pas de flou : il laissait une ligne sous l'en-tête) */}
        <span className="relative mt-2 w-28 h-28 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgb(245 158 11 / 0.22) 0%, rgb(245 158 11 / 0.08) 45%, rgb(245 158 11 / 0) 70%)' }} />
          <span className="relative w-20 h-20 rounded-full bg-amber-500/15 flex items-center justify-center">
            <Lightbulb className="w-10 h-10 text-amber-500" strokeWidth={1.8} />
          </span>
        </span>
        <span className="mt-3 text-[13px] font-bold uppercase tracking-wider text-amber-600">{tip.title}</span>
        <p className="mt-2 text-[19px] font-semibold text-slate-900 leading-snug max-w-[330px] [text-wrap:pretty]">{nb(tip.text)}</p>
      </div>

      {tip.stats && tip.stats.length > 0 && (
        <>
          <SectionTitle>Les chiffres</SectionTitle>
          <Stats stats={tip.stats} />
        </>
      )}

      <SectionTitle>Pourquoi ce conseil</SectionTitle>
      <p className="px-4 text-[14px] text-slate-600 leading-relaxed [text-wrap:pretty]">{nb(tip.why)}</p>

      {part && (
        <button onClick={() => onOpenPart(part.id)} className="mt-4 w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-100 text-left cursor-pointer active:bg-slate-200/60 transition-colors">
          {(() => {
            const Icon = PART_ICON[part.id];
            const t = partTone(part);
            return (
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${t}1f`, color: t }}>
                <Icon className="w-4 h-4" />
              </span>
            );
          })()}
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold text-slate-900">Voir la partie « {part.label} »</span>
            <span className="block text-[12px] text-slate-500">
              {part.points} / {part.max} points
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      )}

      <ActionButton action={tip.action} onAction={onAction} />

      {health.tips.length > 1 && (
        <>
          <SectionTitle>Autres conseils</SectionTitle>
          <TipList health={health} skip={index} onOpen={onOpenTip} />
        </>
      )}
    </div>
  );
};
