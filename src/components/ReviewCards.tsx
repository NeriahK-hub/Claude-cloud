import React, { useState } from 'react';
import { track } from '../lib/usage';
import { CalendarRange, Sparkles, X, ChevronRight, Play } from 'lucide-react';
import { Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { useDisplayPrefs } from '../lib/display';
import { weekBounds } from '../lib/review';
import { WeekTool } from './MoneyReviews';
import { YearWrapped } from './YearWrapped';
import { replayBg, yearTheme } from '../lib/yearTheme';
import { useFeature, useFlag } from '../lib/remoteConfig';
import { formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';

// Sur l'accueil : « Ton bilan de la semaine est prêt » (dimanche soir → mardi)
// et « Ton année en résumé » (mi-décembre → fin janvier). Chaque carte se ferme d'un geste.

const KEY = 'ap.reviewSeen'; // { week: 'AAAA-MM-JJ', year: 2026 }
const read = (): { week?: string; year?: number } => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};
const write = (v: { week?: string; year?: number }) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...v }));
  } catch {
    /* stockage indisponible */
  }
};

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
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

const Card: React.FC<{ Icon: typeof Sparkles; bg: string; title: string; text: string; onOpen: () => void; onHide: () => void }> = ({ Icon, bg, title, text, onOpen, onHide }) => (
  <div className="relative">
    <button onClick={onOpen} className="w-full text-left rounded-3xl p-4 pr-12 flex items-center gap-3.5 cursor-pointer active:scale-[0.99] transition" style={{ background: bg }}>
      <span className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgb(255 255 255 / 0.22)' }}>
        <Icon className="w-6 h-6" style={{ color: '#fff' }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold" style={{ color: '#fff' }}>
          {title}
        </span>
        <span className="block text-[13px] leading-snug" style={{ color: 'rgb(255 255 255 / 0.88)' }}>
          {text}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'rgb(255 255 255 / 0.8)' }} />
    </button>
    <button onClick={onHide} aria-label="Masquer" className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer" style={{ background: 'rgb(0 0 0 / 0.18)', color: '#fff' }}>
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
);

export const ReviewCards: React.FC<{ transactions: Transaction[]; settings: Settings; categories: Category[] }> = ({ transactions, settings, categories }) => {
  const { weekStart } = useDisplayPrefs();
  const [seen, setSeen] = useState(read);
  const [open, setOpen] = useState<null | 'week' | 'year'>(null);
  const wrappedOn = useFeature('wrapped');
  const wrappedNow = useFlag('wrappedNow');
  const countdownOn = useFeature('wrappedCountdown');
  const round = (v: number) =>
    Math.abs(v) >= 100 || v === 0 ? formatMoney(Math.round(v), settings.mainCurrency, { ...getPrefs(), decimals: 'never' }) : formatMoney(v, settings.mainCurrency, { ...getPrefs(), decimals: 'auto' });
  if (transactions.length < 5) return null;
  const now = new Date();

  // Semaine : le dimanche soir (après 17 h) on montre celle qui finit ; lundi et mardi, celle d'avant
  const lastDay = (weekStart + 6) % 7;
  const endOfWeekEvening = now.getDay() === lastDay && now.getHours() >= 17;
  const startOfWeek = [weekStart, (weekStart + 1) % 7].includes(now.getDay());
  const weekOffset = endOfWeekEvening ? 0 : startOfWeek ? -1 : null;
  const weekKey = weekOffset !== null ? weekBounds(weekStart, weekOffset, now).start.toISOString().slice(0, 10) : '';
  const showWeek = weekOffset !== null && seen.week !== weekKey;

  // Année (Wrapped) : compte à rebours du 15 au 30 novembre, puis le Wrapped du 1er décembre au 31 janvier
  // (en janvier : l'année qui vient de finir, avec ses 12 mois)
  const m = now.getMonth();
  const year = m === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const hasYear = transactions.some((t) => new Date(t.createdAt).getFullYear() === year);
  // Aperçu en local seulement : ?wrapped=countdown ou ?wrapped=card (jamais en production)
  const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('wrapped') : null;
  // Pilotage depuis l'espace admin (Fonctionnalités) : Wrapped allumé / coupé, « montrer maintenant », compte à rebours
  const forced = wrappedNow && wrappedOn;
  const countdown =
    preview === 'countdown'
      ? 16
      : wrappedOn && countdownOn && !forced && m === 10 && now.getDate() >= 15 && hasYear
        ? Math.round((new Date(now.getFullYear(), 11, 1).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
        : 0;
  const showYear = preview === 'card' || (wrappedOn && (forced || m === 11 || m === 0) && seen.year !== year && hasYear);

  if (!showWeek && !showYear && !countdown && !open) return null;
  const hide = (v: { week?: string; year?: number }) => {
    write(v);
    setSeen(read());
  };
  return (
    <div className="space-y-3 empty:hidden">
      {countdown > 0 && <Countdown days={countdown} year={year} />}
      {showYear && (
        <WrappedCard year={year} onOpen={() => { track('home.wrapped'); setOpen('year'); }} onHide={() => hide({ year })} />
      )}
      {showWeek && (
        <Card
          Icon={CalendarRange}
          bg="linear-gradient(135deg, #10B981, #0EA5E9)"
          title="Ton bilan de la semaine est prêt"
          text="Combien tu as dépensé, ton jour le plus cher, où est parti l'argent."
          onOpen={() => { track('home.week'); setOpen('week'); }}
          onHide={() => hide({ week: weekKey })}
        />
      )}
      {open === 'week' && (
        <Sheet
          title="Bilan de la semaine"
          onClose={() => {
            setOpen(null);
            hide({ week: weekKey });
          }}
        >
          <WeekTool txs={transactions} settings={settings} categories={categories} initialOffset={weekOffset ?? 0} />
        </Sheet>
      )}
      {/* Le Wrapped s'ouvre directement en plein écran */}
      {open === 'year' && (
        <YearWrapped
          txs={transactions}
          settings={settings}
          categories={categories}
          year={year}
          round={round}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
};

// Fond commun des cartes Wrapped : style « Replay », aux couleurs de l'année
const WrapBg: React.FC<{ year: number }> = ({ year }) => {
  const t = yearTheme(year);
  return (
    <span className="absolute inset-0 pointer-events-none" aria-hidden style={{ background: replayBg(t) }}>
      <span className="replay-orb absolute -right-16 -bottom-24 w-64 h-64 rounded-full" style={{ background: `radial-gradient(circle, ${t.b}66 0%, ${t.a}33 45%, transparent 70%)` }} />
    </span>
  );
};

// « 16 jours avant ton Wrapped 2026 » : le chiffre brille, comme un compte à rebours
const Countdown: React.FC<{ days: number; year: number }> = ({ days, year }) => {
  const t = yearTheme(year);
  return (
    <div className="relative overflow-hidden rounded-3xl p-5 flex items-center gap-4" style={{ background: '#050807' }}>
      <WrapBg year={year} />
      <span className="relative font-black leading-none tabular-nums wrap-count" style={{ fontSize: 72, color: t.hi, textShadow: `0 0 30px ${t.a}AA, 0 0 80px ${t.b}66` }}>
        {days}
      </span>
      <span className="relative min-w-0">
        <span className="block text-[13px] font-bold uppercase tracking-wider" style={{ color: t.hi }}>
          {days > 1 ? 'jours' : 'jour'} avant
        </span>
        <span className="block text-[19px] font-extrabold leading-tight" style={{ color: '#fff' }}>
          Ton Wrapped {year}
        </span>
        <span className="block text-[13px] leading-snug mt-0.5" style={{ color: 'rgb(255 255 255 / 0.7)' }}>
          Le 1er décembre, découvre ton année avec Wallo. Continue de noter&nbsp;!
        </span>
      </span>
    </div>
  );
};

// « Voici ton année 2026. » : ouvre la story (style « Replay »)
const WrappedCard: React.FC<{ year: number; onOpen: () => void; onHide: () => void }> = ({ year, onOpen, onHide }) => {
  const t = yearTheme(year);
  return (
    <div className="relative">
      <button onClick={onOpen} className="relative w-full overflow-hidden rounded-3xl px-5 pt-8 pb-6 text-center cursor-pointer active:scale-[0.99] transition" style={{ background: '#050807' }}>
        <WrapBg year={year} />
        <span className="relative block text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgb(255 255 255 / 0.6)' }}>
          Wrapped
        </span>
        <span className="relative block text-[28px] font-bold tracking-tight leading-tight mt-1" style={{ color: '#fff' }}>
          Voici ton année <span style={{ color: t.hi }}>{year}</span>.
        </span>
        <span className="relative mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-bold" style={{ background: '#fff', color: '#050807' }}>
          Voir <Play className="w-3 h-3" fill="#050807" />
        </span>
      </button>
      <button onClick={onHide} aria-label="Masquer" className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer" style={{ background: 'rgb(255 255 255 / 0.15)', color: '#fff' }}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
