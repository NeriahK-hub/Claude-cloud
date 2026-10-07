import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Flame,
  Footprints,
  Crown,
  ListChecks,
  Target,
  Mountain,
  Trophy,
  TrendingUp,
  Gem,
  PieChart,
  ShieldCheck,
  Sun,
  Sofa,
  HandCoins,
  HeartPulse,
  Lock,
  Award,
  Check,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  Share2,
  Loader2,
  BellRing,
} from 'lucide-react';
import { enableNotifications, getDailyReminder, pushConfigured, setDailyReminder, useNotifyState } from '../lib/notify';
import { Budget, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { debtsSummary } from '../lib/debts';
import { formatDate } from '../lib/display';
import { Badge, BadgeFamily, computeBadges, computeStreak, FAMILY_LABEL, FLAME_TIERS, markBadgesSeen, nextTierOf, Streak, tierOf, unitOf } from '../lib/achievements';
import { dayKey } from '../lib/insights';
import { track } from '../lib/usage';
import type { SharedDebts } from './DebtsView';

// Séries et badges sur l'accueil : la série de jours où tu notes tes opérations,
// et des badges à débloquer. En touchant : la série en grand et tous les badges.

const ICONS: Record<string, typeof Flame> = { Flame, Footprints, Crown, ListChecks, Target, Mountain, Trophy, TrendingUp, Gem, PieChart, ShieldCheck, Sun, Sofa, HandCoins, HeartPulse };
// Couleur de la flamme selon le nombre de jours (orange, rouge, rose, violette, bleue, or)
const flameColor = (n: number) => tierOf(n)?.color ?? '#F97316';

const nbsp = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const daysText = (n: number) => `${nbsp(n)} jour${n > 1 ? 's' : ''}`;

export const BadgesCard: React.FC<{
  transactions: Transaction[];
  wallets: Wallet[];
  budgets: Budget[];
  categories: Category[];
  settings: Settings;
  shared?: SharedDebts;
  compact?: boolean; // tuile à côté de la santé (accueil)
}> = ({ transactions, wallets, budgets, categories, settings, shared, compact }) => {
  const [open, setOpen] = useState(false);
  const [seenTick, setSeenTick] = useState(0); // relit les badges « nouveaux » après fermeture
  const streak = useMemo(() => computeStreak(transactions), [transactions]);
  const badges = useMemo(() => {
    const debts = debtsSummary(transactions, settings, shared?.shares, shared?.me);
    return computeBadges({ transactions, wallets, budgets, categories, settings, debts, streak });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, wallets, budgets, categories, settings, shared?.shares, shared?.me, streak, seenTick]);
  const got = badges.filter((b) => b.unlocked).length;
  const fresh = badges.filter((b) => b.isNew);

  const subtitle = !transactions.length
    ? 'Note ta première opération pour lancer ta série.'
    : streak.today
      ? 'C’est fait pour aujourd’hui. À demain !'
      : streak.current > 0
        ? 'Note une opération aujourd’hui pour la garder.'
        : 'Note une opération aujourd’hui pour repartir.';

  const openSheet = () => {
    track('home.badges');
    setOpen(true);
  };
  return (
    <>
      {compact ? (
        <button
          onClick={openSheet}
          data-coach="badges"
          className="relative w-full h-full text-left bg-white rounded-3xl border border-slate-100 p-4 flex flex-col gap-3 cursor-pointer hover:bg-slate-50 active:scale-[0.98] transition"
        >
          {fresh.length > 0 && <span className="absolute top-3.5 right-3.5 w-2.5 h-2.5 rounded-full bg-accent badge-glow" aria-label="Nouveau badge" />}
          <FlameBadge streak={streak} size={48} />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-slate-900 leading-tight whitespace-nowrap">
              {streak.current > 0 ? daysText(streak.current) : 'Ta série'}
            </span>
            <span className="block text-[12px] text-slate-500 leading-snug mt-0.5 tabular-nums">
              {streak.today ? 'Fait aujourd’hui' : streak.current > 0 ? 'À garder aujourd’hui' : 'À lancer aujourd’hui'}
              {' · '}
              <span className="whitespace-nowrap">
                {got}&nbsp;/&nbsp;{badges.length}&nbsp;badges
              </span>
            </span>
          </span>
        </button>
      ) : (
      <button
        onClick={openSheet}
        data-coach="badges"
        className="w-full text-left bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3.5 cursor-pointer hover:bg-slate-50 active:scale-[0.99] transition"
      >
        <FlameBadge streak={streak} size={56} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-slate-900 whitespace-nowrap">
              {streak.current > 0 ? `Série de ${daysText(streak.current)}` : 'Ta série'}
            </span>
            {fresh.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-accent text-[11px] font-bold whitespace-nowrap badge-glow">
                {fresh.length > 1 ? `${fresh.length} nouveaux badges` : 'Nouveau badge'}
              </span>
            )}
          </div>
          <p className="text-[12px] text-slate-500 leading-snug mt-0.5">{subtitle}</p>
          {/* Les badges obtenus, en petit */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex -space-x-1.5">
              {badges
                .filter((b) => b.unlocked)
                .slice(-4)
                .map((b) => {
                  const Icon = ICONS[b.icon] ?? Award;
                  return (
                    <span key={b.id} className="w-6 h-6 rounded-full flex items-center justify-center ring-2 ring-white" style={{ background: b.color }}>
                      <Icon className="w-3 h-3 text-white" strokeWidth={2.4} />
                    </span>
                  );
                })}
            </div>
            <span className="text-[12px] font-semibold text-slate-600 tabular-nums whitespace-nowrap">
              {got}&nbsp;/&nbsp;{badges.length} badges
            </span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </button>
      )}
      {open && (
        <BadgesSheet
          streak={streak}
          badges={badges}
          onClose={() => {
            markBadgesSeen(badges);
            setSeenTick((t) => t + 1);
            setOpen(false);
          }}
        />
      )}
    </>
  );
};

// Force du feu selon la série : 1 = petite flamme calme … 5 = brasier (étincelles, cœur jaune, chaleur)
const heatOf = (n: number) => (n <= 0 ? 0 : n <= 2 ? 1 : n <= 10 ? 2 : n <= 30 ? 3 : n <= 60 ? 4 : 5);
const HEAT = [
  { speed: 0, amp: 0, sparks: 0, glow: 0 },
  { speed: 3.2, amp: 0.5, sparks: 0, glow: 0.15 }, // 1–2 jours : la flamme vient de s'allumer
  { speed: 2.2, amp: 1, sparks: 0, glow: 0.25 }, // 3–10
  { speed: 1.5, amp: 1.5, sparks: 3, glow: 0.35 }, // 11–30 : premières étincelles
  { speed: 1.1, amp: 2, sparks: 5, glow: 0.45 }, // 31–60
  { speed: 0.8, amp: 2.6, sparks: 8, glow: 0.6 }, // 61 et + : ça brûle vraiment
];

// Flamme animée : plus la série est longue, plus elle danse vite, plus elle brille et crache des étincelles
export const LiveFlame: React.FC<{ days: number; size: number; color?: string; sparks?: boolean }> = ({ days, size, color, sparks = true }) => {
  const heat = heatOf(days);
  const h = HEAT[heat];
  const c = color ?? flameColor(days);
  if (!heat) return <Flame style={{ width: size, height: size, color: 'var(--color-slate-300)' }} strokeWidth={2} />;
  const vars = { '--flame-speed': `${h.speed}s`, '--flame-amp': h.amp } as React.CSSProperties;
  const count = sparks ? h.sparks : 0;
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size, ...vars }}>
      {/* Chaleur derrière la flamme */}
      {heat >= 2 && (
        <span
          className="absolute rounded-full flame-heat"
          style={{ inset: -size * 0.25, background: `radial-gradient(circle at 50% 60%, ${c}${Math.round(h.glow * 255).toString(16).padStart(2, '0')} 0%, ${c}00 65%)` }}
        />
      )}
      <Flame className="relative flame-dance" style={{ width: size, height: size, color: c }} fill={`${c}${heat >= 3 ? '88' : '55'}`} strokeWidth={2} />
      {/* Cœur jaune qui danse à contretemps : à partir de 11 jours */}
      {heat >= 3 && (
        <Flame
          className="absolute flame-core"
          style={{ width: size * 0.45, height: size * 0.45, bottom: size * 0.1, color: '#FDE047' }}
          fill={heat >= 5 ? '#FEF9C3' : '#FDE04788'}
          strokeWidth={0}
        />
      )}
      {/* Étincelles qui montent */}
      {Array.from({ length: count }, (_, i) => {
        const x = ((i * 37) % 60) - 30; // réparties de gauche à droite
        const s = Math.max(2, size * (0.06 + ((i * 13) % 5) * 0.012));
        return (
          <span
            key={i}
            className="absolute rounded-full flame-spark"
            style={{
              width: s,
              height: s,
              left: `calc(50% + ${(x / 100) * size}px)`,
              bottom: size * 0.35,
              background: i % 3 === 0 ? '#FDE047' : c,
              animationDelay: `${(i * 0.37) % (h.speed * 1.6)}s`,
              animationDuration: `${h.speed * 1.6}s`,
              ['--spark-x' as string]: `${(i % 2 ? 1 : -1) * (4 + (i % 4) * 3)}px`,
              ['--spark-h' as string]: `${size * (0.7 + (i % 3) * 0.2)}px`,
            }}
          />
        );
      })}
    </span>
  );
};

// La flamme dans son rond : sa couleur et sa force suivent la série
const FlameBadge: React.FC<{ streak: Streak; size: number }> = ({ streak, size }) => {
  const lit = streak.current > 0;
  const big = size > 80;
  const FLAME = flameColor(streak.current);
  return (
    <span className="relative shrink-0 flex items-center justify-center rounded-full" style={{ width: size, height: size, background: lit ? `${FLAME}1f` : 'var(--color-slate-100)' }}>
      {big && lit && <span className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${FLAME}33 0%, ${FLAME}00 70%)`, transform: 'scale(1.35)' }} />}
      <LiveFlame days={streak.current} size={size * 0.5} sparks={size >= 48} />
      {!big && lit && (
        <span className="absolute -bottom-1 -right-1 min-w-[24px] h-6 px-1.5 rounded-full bg-white ring-2 ring-white flex items-center justify-center text-[12px] font-bold tabular-nums" style={{ color: FLAME, boxShadow: '0 1px 4px rgb(0 0 0 / 0.12)' }}>
          {streak.current}
        </span>
      )}
    </span>
  );
};

// Médaille : couleur pleine si obtenue ; sinon grise, avec la progression autour
const Medal: React.FC<{ badge: Badge; size: number; animate?: boolean }> = ({ badge, size, animate }) => {
  const Icon = ICONS[badge.icon] ?? Award;
  const stroke = Math.max(3, size / 16);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, badge.value / badge.target);
  const lock = Math.min(30, Math.max(18, size * 0.3));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(ratio));
    return () => cancelAnimationFrame(id);
  }, [ratio]);
  if (badge.unlocked) {
    return (
      <span
        className={`relative shrink-0 rounded-full flex items-center justify-center ${animate ? 'badge-pop' : ''}`}
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 30% 25%, ${badge.color}cc, ${badge.color} 60%)`,
          boxShadow: `0 ${size / 12}px ${size / 4}px -${size / 10}px ${badge.color}aa, inset 0 0 0 ${stroke}px rgb(255 255 255 / 0.28)`,
        }}
      >
        <span className="absolute inset-0 rounded-full overflow-hidden">
          <span className="badge-shine absolute inset-0" />
        </span>
        <Icon className="relative text-white" style={{ width: size * 0.44, height: size * 0.44 }} strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <span className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="var(--color-slate-100)" strokeWidth={stroke} className="stroke-slate-200" />
        {ratio > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke={badge.color}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - shown)}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        )}
      </svg>
      <Icon className="relative text-slate-300" style={{ width: size * 0.4, height: size * 0.4 }} strokeWidth={2} />
      {/* Cadenas posé sur le bord du cercle, en bas à droite */}
      <span
        className="absolute rounded-full bg-white ring-2 ring-white flex items-center justify-center"
        style={{ width: lock, height: lock, right: Math.max(-2, size * 0.146 - lock / 2), bottom: Math.max(-2, size * 0.146 - lock / 2), boxShadow: '0 1px 3px rgb(0 0 0 / 0.12)' }}
      >
        <Lock className="w-[55%] h-[55%] text-slate-400" strokeWidth={2.4} />
      </span>
    </span>
  );
};

const BadgesSheet: React.FC<{ streak: Streak; badges: Badge[]; onClose: () => void }> = ({ streak, badges, onClose }) => {
  const [view, setView] = useState<string | null>(null); // id d'un badge, ou 'calendar'
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: 0 });
  }, [view]);
  const badge = badges.find((b) => b.id === view);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Séries et badges"
        ref={box}
        className="w-full sm:max-w-[420px] h-[88dvh] sm:h-auto sm:max-h-[90dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {view === 'calendar' ? (
          <CalendarView streak={streak} onBack={() => setView(null)} onClose={onClose} />
        ) : badge ? (
          <BadgeView key={badge.id} badge={badge} onBack={() => setView(null)} onClose={onClose} />
        ) : (
          <Overview streak={streak} badges={badges} onClose={onClose} onOpen={(v) => { if (v === 'calendar') track('home.calendar'); setView(v); }} />
        )}
      </div>
    </div>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-baseline justify-between mb-2 mt-6 px-1">
    <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">{children}</h3>
    {right}
  </div>
);

const Overview: React.FC<{ streak: Streak; badges: Badge[]; onClose: () => void; onOpen: (id: string) => void }> = ({ streak, badges, onClose, onOpen }) => {
  const got = badges.filter((b) => b.unlocked).length;
  const families: BadgeFamily[] = ['regular', 'saving', 'control'];
  // Le prochain badge le plus proche : pour donner envie
  const next = badges.filter((b) => !b.unlocked && b.value > 0).sort((a, b) => b.value / b.target - a.value / a.target)[0];
  return (
    <div className="animate-pick-back">
      <div className="sheet-head flex items-center justify-between mb-2">
        <h2 className="text-[22px] font-bold tracking-tight text-slate-900">Séries et badges</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* La série en grand */}
      <div className="flex flex-col items-center text-center pt-3">
        <FlameBadge streak={streak} size={112} />
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-[44px] font-bold tabular-nums tracking-tight text-slate-900 leading-none">{nbsp(streak.current)}</span>
          <span className="text-[17px] font-semibold text-slate-500">jour{streak.current > 1 ? 's' : ''} de suite</span>
        </div>
        <p className="text-[14px] text-slate-500 mt-1.5 max-w-[300px] leading-snug [text-wrap:pretty]">
          {streak.today
            ? 'Tu as déjà noté aujourd’hui. Reviens demain pour continuer !'
            : streak.current > 0
              ? 'Note au moins une opération aujourd’hui, sinon ta série repart à zéro.'
              : 'Note au moins une opération par jour : ta série grandit chaque jour.'}
        </p>
      </div>

      {/* Les 7 derniers jours : toucher ouvre le calendrier */}
      <button onClick={() => onOpen('calendar')} className="mt-5 w-full rounded-2xl bg-slate-100 p-3 pb-2 cursor-pointer active:scale-[0.99] transition text-left">
        <div className="grid grid-cols-7 gap-1">
          {streak.week.map((d) => (
            <div key={d.key} className="flex flex-col items-center gap-1.5">
              <span className={`text-[11px] font-semibold ${d.isToday ? 'text-slate-900' : 'text-slate-400'}`}>{d.isToday ? 'Auj.' : d.label}</span>
              <DayDot done={d.done} run={d.run} missed={!d.done && !d.isToday && !!streak.first && d.key > streak.first} today={d.isToday} size={36} />
            </div>
          ))}
        </div>
        <span className="mt-2 pt-2 border-t border-slate-200/70 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-slate-700">
          <CalendarDays className="w-4 h-4" /> Voir le calendrier de mes séries <ChevronRight className="w-4 h-4 text-slate-400" />
        </span>
      </button>

      <FlameLevels current={streak.current} />
      <StreakReminder />

      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="rounded-2xl bg-slate-100 px-4 py-3">
          <div className="text-[12px] text-slate-500 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-500" /> Ton record
          </div>
          <div className="text-[20px] font-bold tabular-nums text-slate-900 whitespace-nowrap mt-0.5">{daysText(streak.best)}</div>
        </div>
        <div className="rounded-2xl bg-slate-100 px-4 py-3">
          <div className="text-[12px] text-slate-500 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-violet-500" /> Badges
          </div>
          <div className="text-[20px] font-bold tabular-nums text-slate-900 whitespace-nowrap mt-0.5">
            {got} <span className="text-[14px] font-semibold text-slate-400">sur {badges.length}</span>
          </div>
        </div>
      </div>

      {next && (
        <button onClick={() => onOpen(next.id)} className="mt-2 w-full text-left rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition" style={{ background: `${next.color}14` }}>
          <Medal badge={next} size={44} />
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] font-semibold" style={{ color: next.color }}>
              Prochain badge
            </span>
            <span className="block text-[14px] font-semibold text-slate-900">{next.name}</span>
            <Progress badge={next} />
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      )}

      {families.map((f) => {
        const list = badges.filter((b) => b.family === f);
        return (
          <div key={f}>
            <SectionTitle right={<span className="text-[12px] font-semibold text-slate-400 tabular-nums">{list.filter((b) => b.unlocked).length}&nbsp;/&nbsp;{list.length}</span>}>{FAMILY_LABEL[f]}</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {list.map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => onOpen(b.id)}
                  className="relative flex flex-col items-center gap-2 pt-3.5 pb-3 px-1 rounded-2xl bg-slate-50 cursor-pointer active:scale-95 transition"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {b.isNew && <span className="absolute top-1.5 right-1.5 px-1.5 py-px rounded-full bg-accent text-[9px] font-bold uppercase">Nouveau</span>}
                  <Medal badge={b} size={58} animate={b.isNew} />
                  <span className={`text-[12px] font-semibold text-center leading-tight line-clamp-2 min-h-[2lh] ${b.unlocked ? 'text-slate-900' : 'text-slate-500'}`}>{b.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[12px] text-slate-400 text-center mt-5 px-4 leading-snug">Les badges se débloquent tout seuls, d&rsquo;après ce que tu notes. Une fois gagnés, ils restent à toi.</p>
    </div>
  );
};

const Progress: React.FC<{ badge: Badge }> = ({ badge }) => {
  const ratio = Math.min(1, badge.value / badge.target);
  const pct = badge.unit === '%';
  return (
    <span className="flex items-center gap-2 mt-1">
      <span className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${ratio * 100}%`, background: badge.color }} />
      </span>
      <span className="text-[11px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
        {pct ? `${badge.value} %` : `${nbsp(badge.value)} / ${nbsp(badge.target)}`}
      </span>
    </span>
  );
};

const BadgeView: React.FC<{ badge: Badge; onBack: () => void; onClose: () => void }> = ({ badge, onBack, onClose }) => {
  const left = Math.max(0, badge.target - badge.value);
  const pct = badge.unit === '%';
  return (
    <div className="animate-pick-in">
      <div className="sheet-head grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2 mb-4">
        <button onClick={onBack} aria-label="Retour" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-[17px] font-bold text-center truncate">Badge</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center text-center pt-4">
        <span className="relative">
          {badge.unlocked && <span className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${badge.color}40 0%, ${badge.color}00 70%)`, transform: 'scale(1.6)' }} />}
          <Medal badge={badge} size={128} animate />
        </span>
        <span className="mt-6 text-[12px] font-bold uppercase tracking-wider" style={{ color: badge.unlocked ? badge.color : 'var(--color-slate-400)' }}>
          {badge.unlocked ? 'Badge obtenu' : 'À débloquer'}
        </span>
        <h3 className="mt-1 text-[26px] font-bold tracking-tight text-slate-900 leading-tight">{badge.name}</h3>
        <p className="mt-2 text-[16px] text-slate-600 leading-snug max-w-[320px] [text-wrap:pretty]">{badge.unlocked ? badge.done : badge.how}</p>
      </div>

      {badge.unlocked ? (
        <div className="mt-6 rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
          {badge.at && (
            <div className="flex items-center justify-between gap-3 px-4 min-h-[48px]">
              <span className="text-[14px] text-slate-600 flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-slate-400" /> Obtenu le
              </span>
              <span className="text-[15px] font-semibold text-slate-900 whitespace-nowrap">{formatDate(new Date(badge.at + 'T12:00'))}</span>
            </div>
          )}
          <div className="flex items-start gap-3 px-4 py-3">
            <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" strokeWidth={2.6} />
            <span className="text-[14px] text-slate-600 leading-snug">{badge.how}</span>
          </div>
        </div>
      ) : null}
      {badge.unlocked && <ShareBadgeButton badge={badge} />}
      {badge.unlocked ? null : badge.target === 1 ? (
        // Badge « oui ou non » : pas de barre 0 / 1, juste ce qu'il faut faire
        <div className="mt-6 rounded-2xl bg-slate-100 px-4 py-3.5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-slate-400" />
          </span>
          <span className="text-[14px] text-slate-600 leading-snug">Pas encore obtenu. Il se débloque tout seul dès que c&rsquo;est fait.</span>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-slate-100 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] text-slate-600">Ta progression</span>
            <span className="text-[15px] font-bold tabular-nums text-slate-900 whitespace-nowrap">
              {pct ? `${badge.value} %` : `${nbsp(badge.value)} / ${nbsp(badge.target)}`}
            </span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, (badge.value / badge.target) * 100)}%`, background: badge.color }} />
          </div>
          <p className="text-[13px] text-slate-500 mt-2.5 leading-snug">
            {badge.value === 0
              ? 'Pas encore commencé. Tu peux le faire !'
              : pct
                ? `Encore ${left} % et il est à toi.`
                : `Encore ${nbsp(left)} ${unitOf(left, badge.unit)} et il est à toi.`}
          </p>
        </div>
      )}
    </div>
  );
};

// ---------- Un jour de la série (rond) ----------
// Noté : rond plein, couleur de la flamme du moment ; manqué : rond rouge pâle ; aujourd'hui pas encore : pointillés
const DayDot: React.FC<{ done: boolean; run: number; missed: boolean; today: boolean; size: number; label?: React.ReactNode }> = ({ done, run, missed, today, size, label }) => {
  const color = flameColor(run);
  const base = 'rounded-full flex items-center justify-center tabular-nums font-semibold transition';
  const style: React.CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (done)
    return (
      <span className={`${base} text-white`} style={{ ...style, background: color, boxShadow: today ? `0 0 0 2px var(--color-white), 0 0 0 4px ${color}` : undefined }}>
        {label ?? <Flame className="text-white" style={{ width: size * 0.45, height: size * 0.45 }} fill="rgb(255 255 255 / 0.35)" />}
      </span>
    );
  if (missed)
    return (
      <span className={`${base} bg-red-500/12 text-red-500`} style={style}>
        {label ?? <X style={{ width: size * 0.4, height: size * 0.4 }} strokeWidth={2.6} />}
      </span>
    );
  if (today)
    return (
      <span className={`${base} border-2 border-dashed border-slate-300 text-slate-900`} style={style}>
        {label}
      </span>
    );
  return (
    <span className={`${base} ${label ? 'text-slate-400' : 'bg-white'}`} style={style}>
      {label}
    </span>
  );
};

// ---------- Les couleurs de la flamme ----------
const tierRange = (t: { from: number; to: number | null }) => (t.to === null ? `${t.from} et +` : `${t.from}–${t.to}`);

const FlameLevels: React.FC<{ current: number }> = ({ current }) => {
  const [open, setOpen] = useState(false);
  const tier = tierOf(current);
  const next = nextTierOf(current);
  const color = flameColor(current);
  const from = tier ? tier.from - 1 : 0;
  const ratio = next ? Math.min(1, (current - from) / (next.from - from)) : 1;
  return (
    <div className="mt-2 rounded-2xl bg-slate-100 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-left">
        <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: current > 0 ? `${color}22` : 'var(--color-white)' }}>
          <Flame className="w-5 h-5" style={{ color: current > 0 ? color : 'var(--color-slate-300)' }} fill={current > 0 ? `${color}55` : 'none'} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-slate-900">{tier ? tier.name : 'Flamme éteinte'}</span>
          <span className="block text-[12px] text-slate-500 leading-snug">
            {next
              ? `Encore ${daysText(next.from - current)} pour la ${next.name.toLowerCase()}`
              : 'Tu as la plus belle flamme. Garde-la allumée !'}
          </span>
          <span className="block mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${ratio * 100}%`, background: next ? next.color : color }} />
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 animate-fade-in">
          <p className="text-[12px] text-slate-500 px-1 mb-2 leading-snug">Ta flamme change de couleur quand ta série grandit&nbsp;:</p>
          <div className="grid grid-cols-3 gap-1.5">
            {FLAME_TIERS.map((t) => {
              const on = tier?.from === t.from;
              const reached = current >= t.from;
              return (
                <div key={t.from} className={`rounded-xl px-2 py-2.5 flex flex-col items-center gap-1 ${on ? 'bg-white' : ''}`} style={on ? { boxShadow: `inset 0 0 0 2px ${t.color}` } : undefined}>
                  <span style={{ opacity: reached ? 1 : 0.7 }}>
                    <LiveFlame days={t.from} size={30} color={t.color} />
                  </span>
                  <span className="text-[11px] font-semibold text-slate-900 text-center leading-tight">{t.name.replace('Flamme ', '')}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{tierRange(t)}&nbsp;j</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------- Calendrier des séries ----------
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const CalendarView: React.FC<{ streak: Streak; onBack: () => void; onClose: () => void }> = ({ streak, onBack, onClose }) => {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const firstDate = streak.first ? new Date(streak.first + 'T00:00') : now;
  const canPrev = ym.y * 12 + ym.m > firstDate.getFullYear() * 12 + firstDate.getMonth();
  const canNext = ym.y * 12 + ym.m < now.getFullYear() * 12 + now.getMonth();
  const move = (n: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  const todayKey = dayKey(now);

  const count = new Date(ym.y, ym.m + 1, 0).getDate();
  const lead = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7; // lundi en premier
  const cells = Array.from({ length: count }, (_, i) => {
    const d = new Date(ym.y, ym.m, i + 1);
    const k = dayKey(d);
    const run = streak.runs.get(k) ?? 0;
    const future = k > todayKey;
    const isToday = k === todayKey;
    const missed = !run && !future && !isToday && !!streak.first && k > streak.first;
    return { k, day: i + 1, run, future, isToday, missed };
  });
  const done = cells.filter((c) => c.run > 0).length;
  const missed = cells.filter((c) => c.missed).length;
  const longest = Math.max(0, ...cells.map((c) => c.run));
  const title = new Date(ym.y, ym.m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="animate-pick-in">
      <div className="sheet-head grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2 mb-4">
        <button onClick={onBack} aria-label="Retour" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-[17px] font-bold text-center truncate">Calendrier des séries</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mois */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => canPrev && move(-1)} disabled={!canPrev} aria-label="Mois d'avant" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span key={title} className="text-[17px] font-bold text-slate-900 first-letter:uppercase animate-fade-in">
          {title}
        </span>
        <button onClick={() => canNext && move(1)} disabled={!canNext} aria-label="Mois d'après" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Les chiffres du mois */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Jours notés', value: done, color: flameColor(Math.max(1, longest)) },
          { label: 'Jours manqués', value: missed, color: missed ? '#EF4444' : undefined },
          { label: 'Plus longue série', value: longest, color: undefined },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl bg-slate-100 px-2 py-2.5 text-center">
            <div className="text-[22px] font-bold tabular-nums leading-none" style={{ color: x.color }}>
              {x.value}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 leading-tight">{x.label}</div>
          </div>
        ))}
      </div>

      <div key={title + 'g'} className="rounded-2xl bg-slate-100 p-3 animate-fade-in">
        <div className="grid grid-cols-7 gap-y-2 mb-1">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="text-[11px] font-semibold text-slate-400 text-center">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1.5">
          {Array.from({ length: lead }, (_, i) => (
            <span key={'e' + i} />
          ))}
          {cells.map((c) => (
            <span key={c.k} className="flex justify-center">
              <DayDot done={c.run > 0} run={c.run} missed={c.missed} today={c.isToday} size={36} label={<span className={c.future ? 'opacity-50' : ''}>{c.day}</span>} />
            </span>
          ))}
        </div>
      </div>

      {/* Légende */}
      <div className="mt-3 rounded-2xl bg-slate-100 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
          <span className="flex -space-x-1 shrink-0">
            {FLAME_TIERS.slice(0, 4).map((t) => (
              <span key={t.from} className="w-4 h-4 rounded-full ring-2 ring-slate-100" style={{ background: t.color }} />
            ))}
          </span>
          Jour noté (la couleur suit ta flamme)
        </div>
        <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
          <span className="w-4 h-4 rounded-full bg-red-500/15 shrink-0 ml-0.5" />
          Jour manqué&nbsp;: aucune opération notée
        </div>
        <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
          <span className="w-4 h-4 rounded-full border-2 border-dashed border-slate-300 shrink-0 ml-0.5" />
          Aujourd&rsquo;hui, pas encore noté
        </div>
      </div>
      <p className="text-[12px] text-slate-400 text-center mt-3 px-4 leading-snug">
        Tu as oublié un jour&nbsp;? Ajoute l&rsquo;opération avec la bonne date&nbsp;: le jour se colore et ta série se recolle.
      </p>
    </div>
  );
};

// Partager un badge obtenu en image (WhatsApp, statut…)
const ShareBadgeButton: React.FC<{ badge: Badge }> = ({ badge }) => {
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      const { shareBadge } = await import('../lib/shareCards');
      await shareBadge({
        name: badge.name,
        done: badge.done,
        color: badge.color,
        Icon: (ICONS[badge.icon] ?? Award) as unknown as React.ComponentType<Record<string, unknown>>,
        date: badge.at ? new Date(badge.at + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={share}
      disabled={busy}
      className="mt-4 w-full h-12 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition disabled:opacity-60"
      style={{ background: badge.color, color: '#fff' }}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Partager mon badge
    </button>
  );
};

// « Rappel du soir » : à 20 h, une notification si rien n'est noté (« Ta série de 6 jours s'arrête ce soir »).
// Envoyé par le serveur : il faut les notifications et un compte connecté.
const StreakReminder: React.FC = () => {
  const state = useNotifyState();
  const [daily, setDaily] = useState<boolean | null | undefined>(undefined); // null : pas connecté
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (state !== 'on' || !pushConfigured) return;
    let alive = true;
    getDailyReminder()
      .then((v) => alive && setDaily(v))
      .catch(() => alive && setDaily(null));
    return () => {
      alive = false;
    };
  }, [state]);
  if (!pushConfigured || state === 'unsupported') return null;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (state !== 'on') await enableNotifications();
      await setDailyReminder(on);
      setDaily(on);
    } catch {
      /* réseau : on laisse tel quel */
    } finally {
      setBusy(false);
    }
  };
  const hint =
    state === 'denied'
      ? 'Les notifications sont bloquées dans les réglages du téléphone.'
      : state === 'install'
        ? 'Ajoute Wallo à l\u2019écran d\u2019accueil pour recevoir les notifications.'
        : daily === null
          ? 'Connecte-toi (Profil) pour le recevoir.'
          : 'À 20\u00a0h, si tu n\u2019as rien noté\u00a0: «\u00a0Ta série s\u2019arrête ce soir\u00a0».';
  const canToggle = state === 'on' || state === 'default';
  return (
    <label className={`mt-2 flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 ${canToggle && daily !== null ? 'cursor-pointer' : 'opacity-70'}`}>
      <span className="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center shrink-0">
        <BellRing className="w-5 h-5 text-indigo-500" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold text-slate-900">Rappel du soir</span>
        <span className="block text-[12px] text-slate-500 leading-snug">{hint}</span>
      </span>
      {canToggle && daily !== null && (
        busy ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : (
          <input type="checkbox" role="switch" checked={!!daily} onChange={(e) => toggle(e.target.checked)} className="toggle shrink-0" />
        )
      )}
    </label>
  );
};
