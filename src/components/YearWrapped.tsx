import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, Loader2, PiggyBank, CalendarCheck, Receipt, Crown, Shield, Heart, Rocket, Repeat2, ArrowDownLeft, ArrowUpRight, Pause } from 'lucide-react';
import { Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { toMain } from '../lib/money';
import { yearReview } from '../lib/review';
import { haptic } from '../lib/haptics';
import { IconBadge } from './AppIcon';
import { LiveFlame } from './BadgesCard';
import { Fireworks } from './Fireworks';
import { isLiteDevice, replayBg, YearStyle, yearTheme } from '../lib/yearTheme';

// « Ton année » façon Wrapped : une histoire plein écran, écran par écran.
// Toucher à droite = suivant, à gauche = précédent, garder le doigt = pause. Chaque écran avance tout seul.

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// « 1er octobre », « 12 mars »
const dayMonth = (d: Date) => `${d.getDate() === 1 ? '1er' : d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'long' })}`;
const DURATION = 6000; // ms par écran
const WHITE = '#ffffff';
const SOFT = 'rgb(255 255 255 / 0.82)';

// Le nombre monte de 0 à sa valeur à l'apparition de l'écran
const CountUp: React.FC<{ value: number; format: (v: number) => string; ms?: number }> = ({ value, format, ms = 1400 }) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setV(value);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{format(v)}</>;
};

// Le « profil » de l'année, d'après les chiffres
export function personaOf(r: ReturnType<typeof yearReview>) {
  const rate = r.income > 0 ? (r.income - r.expense) / r.income : -1;
  if (rate >= 0.3) return { name: 'L’Épargnant', text: 'Tu as gardé une belle part de ce que tu as reçu. Ton futur toi te dit merci.', Icon: PiggyBank, color: '#10B981' };
  if (r.longest >= 30) return { name: 'Le Régulier', text: 'Jour après jour, tu as noté ton argent. C’est la clé de tout.', Icon: Repeat2, color: '#F97316' };
  if (r.freeDays >= 60) return { name: 'Le Prudent', text: 'Beaucoup de jours sans rien dépenser. Tu sais dire non quand il faut.', Icon: Shield, color: '#3B82F6' };
  if (rate >= 0) return { name: 'L’Équilibriste', text: 'Tu as tenu l’équilibre entre ce qui entre et ce qui sort. Bien joué.', Icon: Crown, color: '#EAB308' };
  if (r.count >= 200) return { name: 'Le Bâtisseur', text: 'Une année chargée, mais tu as tout noté. L’année prochaine, on épargne !', Icon: Rocket, color: '#8B5CF6' };
  return { name: 'Le Bon Vivant', text: 'Tu as profité de l’année. L’année prochaine, un petit objectif d’épargne ?', Icon: Heart, color: '#EC4899' };
}

// Titres et chiffres des écrans (définis ici, pas dans le composant : sinon leur animation repart à chaque image)
const Title: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => (
  <p className="wrap-in text-[22px] font-semibold leading-snug" style={{ color: SOFT, animationDelay: `${delay}ms` }}>
    {children}
  </p>
);
const Huge: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> = ({ children, delay = 200, size = 64 }) => (
  <div className="wrap-pop font-extrabold tracking-tight leading-[1.02] tabular-nums break-words" style={{ color: WHITE, fontSize: size, animationDelay: `${delay}ms` }}>
    {children}
  </div>
);
const Note: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 700 }) => (
  <p className="wrap-in text-[17px] leading-snug mt-5" style={{ color: SOFT, animationDelay: `${delay}ms` }}>
    {children}
  </p>
);

// Chaque écran : deux couleurs pour les bandes lumineuses, et un chiffre géant en fond (facultatif)
type Slide = { id: string; accent: [string, string]; giant?: string | null; replay?: boolean; render: () => React.ReactNode };
const YELLOW = '#FDE047';

export const YearWrapped: React.FC<{
  txs: Transaction[];
  settings: Settings;
  categories: Category[];
  year: number;
  round: (v: number) => string;
  onClose: () => void;
}> = ({ txs, settings, categories, year, round, onClose }) => {
  const r = useMemo(() => yearReview(txs, settings, categories, year), [txs, settings, categories, year]);
  const saved = r.income - r.expense;
  const persona = personaOf(r);
  // Aperçu en local seulement : ?wrappedYear=2027 montre le look d'une autre année avec tes chiffres
  const lookYear = (import.meta.env.DEV && Number(new URLSearchParams(window.location.search).get('wrappedYear'))) || year;
  const theme = yearTheme(lookYear); // couleurs et décor de l'année
  const [lite] = useState(isLiteDevice); // petit téléphone : décor allégé (pas de flou, moins d'animations)
  const maxMonth = Math.max(1, ...r.months.map((m) => m.expense));
  const topCat = r.cats[0];
  const catTotal = r.cats.reduce((s, c) => s + c.amount, 0);

  const money = (v: number) => round(v);
  const big = (s: string) => (s.length > 12 ? 44 : s.length > 9 ? 54 : 64);

  const slides: Slide[] = [
    {
      id: 'intro',
      accent: [theme.a, theme.b],
      replay: true, // fond « Replay » : la boule de lumière de l'année
      render: () => (
        <div className="flex flex-col items-center text-center">
          {/* « 20 » en blanc, « 26 » en jaune, puis « Wrapped » */}
          <div className="wrap-pop font-black leading-[0.9] tracking-tighter" style={{ fontSize: 132, animationDelay: '150ms' }}>
            <span style={{ color: WHITE }}>{String(year).slice(0, 2)}</span>
            <span style={{ color: theme.hi, textShadow: `0 0 40px ${theme.a}88` }}>{String(year).slice(2)}</span>
          </div>
          <div className="wrap-in font-extrabold tracking-tight leading-none mt-1" style={{ color: WHITE, fontSize: 58, animationDelay: '350ms' }}>
            Wrapped
          </div>
          <p className="wrap-in text-[17px] font-semibold mt-6" style={{ color: SOFT, animationDelay: '650ms' }}>
            Ton année avec Wallo
          </p>
          <p className="wrap-in text-[15px] mt-1 max-w-[260px]" style={{ color: 'rgb(255 255 255 / 0.6)', animationDelay: '850ms' }}>
            Ce que tu as reçu, dépensé, gardé… et qui tu es avec ton argent.
          </p>
        </div>
      ),
    },
    {
      id: 'count',
      accent: ['#2563EB', '#06B6D4'],
      giant: String(r.count),
      render: () => (
        <div>
          <Title>Cette année, tu as noté</Title>
          <Huge size={96}>
            <CountUp value={r.count} format={(v) => Math.round(v).toLocaleString('fr-FR')} />
          </Huge>
          <Title delay={400}>opérations</Title>
          <Note>
            Sur <b style={{ color: WHITE }}>{r.notedDays}&nbsp;jours</b>. Chaque opération notée, c&rsquo;est un peu plus de clarté.
          </Note>
        </div>
      ),
    },
    {
      id: 'in',
      accent: ['#10B981', '#06B6D4'],
      render: () => (
        <div>
          <ArrowDownLeft className="wrap-pop w-14 h-14 mb-4" style={{ color: WHITE }} strokeWidth={2.6} />
          <Title>Il est entré</Title>
          <Huge size={big(money(r.income))}>
            <CountUp value={r.income} format={money} />
          </Huge>
          <Note>Salaire, ventes, cadeaux… tout ce que tu as reçu en {year}.</Note>
        </div>
      ),
    },
    {
      id: 'out',
      accent: ['#F43F5E', '#7C3AED'],
      render: () => (
        <div>
          <ArrowUpRight className="wrap-pop w-14 h-14 mb-4" style={{ color: WHITE }} strokeWidth={2.6} />
          <Title>Et il est sorti</Title>
          <Huge size={big(money(r.expense))}>
            <CountUp value={r.expense} format={money} />
          </Huge>
          <Note>
            Soit environ <b style={{ color: WHITE }}>{money(r.expense / 12)}</b> par mois.
          </Note>
        </div>
      ),
    },
    {
      id: 'saved',
      accent: saved >= 0 ? ['#FACC15', '#F59E0B'] : ['#F43F5E', '#9F1239'],
      giant: saved >= 0 && r.income > 0 ? `${Math.round((saved / r.income) * 100)}%` : null,
      render: () => (
        <div>
          <PiggyBank className="wrap-pop w-14 h-14 mb-4" style={{ color: WHITE }} />
          <Title>{saved >= 0 ? 'Au final, il t’est resté' : 'Au final, tu as dépensé en plus'}</Title>
          <Huge size={big(money(Math.abs(saved)))}>
            <CountUp value={Math.abs(saved)} format={money} />
          </Huge>
          <Note>
            {saved >= 0 && r.income > 0
              ? `C’est ${Math.round((saved / r.income) * 100)} % de ce que tu as reçu. ${saved / r.income >= 0.2 ? 'Bravo !' : 'Chaque pourcent compte.'}`
              : 'L’année prochaine, un petit budget peut tout changer.'}
          </Note>
        </div>
      ),
    },
    ...(topCat
      ? [
          {
            id: 'cat',
            accent: ['#C026D3', '#7C3AED'] as [string, string], // toujours vif (la couleur de la catégorie peut être grise)
            giant: '1',
            render: () => (
              <div>
                <Title>Ta catégorie n°1</Title>
                <div className="wrap-pop my-5">
                  <IconBadge icon={topCat.icon} image={topCat.image} color={topCat.color} size="lg" />
                </div>
                <Huge size={topCat.name.length > 14 ? 42 : 56}>{topCat.name}</Huge>
                <Note>
                  <b style={{ color: WHITE }}>{money(topCat.amount)}</b>, soit {catTotal > 0 ? Math.round((topCat.amount / catTotal) * 100) : 0}&nbsp;% de tes dépenses.
                </Note>
                {r.cats.length > 1 && (
                  <div className="mt-6 space-y-2">
                    {r.cats.slice(1, 3).map((c, i) => (
                      <div key={c.id} className="wrap-in flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: 'rgb(255 255 255 / 0.14)', animationDelay: `${1000 + i * 200}ms` }}>
                        <span className="text-[15px] font-bold w-6" style={{ color: SOFT }}>
                          {i + 2}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-[16px] font-semibold" style={{ color: WHITE }}>
                          {c.name}
                        </span>
                        <span className="text-[15px] font-semibold tabular-nums whitespace-nowrap" style={{ color: SOFT }}>
                          {money(c.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
        ]
      : []),
    ...(r.topMonth !== null
      ? [
          {
            id: 'months',
            accent: ['#A855F7', '#6D28D9'] as [string, string],
            giant: String(r.topMonth! + 1),
            render: () => (
              <div>
                <Title>Ton mois le plus cher</Title>
                <Huge size={64}>{cap(MONTHS[r.topMonth!])}</Huge>
                <div className="flex items-end gap-1.5 h-36 mt-8">
                  {r.months.map((m, i) => (
                    <div key={m.m} className="flex-1 h-full flex flex-col justify-end items-center gap-1.5">
                      <div
                        className="w-full rounded-md wrap-bar"
                        style={{
                          height: `${Math.max(4, (m.expense / maxMonth) * 100)}%`,
                          background: m.m === r.topMonth ? '#FDE047' : m.m === r.bestMonth ? '#86EFAC' : 'rgb(255 255 255 / 0.35)',
                          animationDelay: `${300 + i * 60}ms`,
                        }}
                      />
                      <span className="text-[10px] font-bold" style={{ color: SOFT }}>
                        {MONTHS[m.m].charAt(0).toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
                <Note delay={1200}>
                  {money(r.months[r.topMonth!].expense)} dépensés en {MONTHS[r.topMonth!]}.
                  {r.bestMonth !== null && r.bestMonth !== r.topMonth && (
                    <>
                      {' '}
                      Ton meilleur mois pour garder de l&rsquo;argent&nbsp;: <b style={{ color: '#86EFAC' }}>{MONTHS[r.bestMonth]}</b>.
                    </>
                  )}
                </Note>
              </div>
            ),
          },
        ]
      : []),
    ...(r.biggest
      ? [
          {
            id: 'biggest',
            accent: ['#F59E0B', '#EA580C'] as [string, string],
            render: () => {
              const b = r.biggest!;
              return (
                <div>
                  <Receipt className="wrap-pop w-14 h-14 mb-4" style={{ color: WHITE }} />
                  <Title>Ta plus grosse dépense</Title>
                  <Huge size={big(money(-toMain(b.amount, b.currency, settings)))}>{money(-toMain(b.amount, b.currency, settings))}</Huge>
                  <Note>
                    <b style={{ color: WHITE }}>{b.title || b.category}</b>, le {dayMonth(new Date(b.createdAt))}.
                  </Note>
                </div>
              );
            },
          },
        ]
      : []),
    {
      id: 'streak',
      accent: ['#FACC15', '#F97316'],
      giant: String(r.longest),
      render: () => (
        <div className="flex flex-col items-center text-center">
          <div className="wrap-pop mb-6">
            <LiveFlame days={Math.max(r.longest, 1)} size={110} />
          </div>
          <Title>Ta plus longue série</Title>
          <Huge size={96}>
            <CountUp value={r.longest} format={(v) => String(Math.round(v))} />
          </Huge>
          <Title delay={400}>jours de suite</Title>
          <Note>
            Et <b style={{ color: WHITE }}>{r.freeDays}&nbsp;jours</b> sans aucune dépense.
          </Note>
        </div>
      ),
    },
    {
      id: 'persona',
      accent: [persona.color, '#4F46E5'],
      render: () => (
        <div className="flex flex-col items-center text-center">
          <Title>Ton profil de l&rsquo;année</Title>
          <span className="wrap-pop w-32 h-32 rounded-full flex items-center justify-center my-6" style={{ background: 'rgb(255 255 255 / 0.18)', boxShadow: '0 0 0 12px rgb(255 255 255 / 0.08)' }}>
            <persona.Icon className="w-16 h-16" style={{ color: WHITE }} />
          </span>
          <Huge size={48}>{persona.name}</Huge>
          <Note>{persona.text}</Note>
        </div>
      ),
    },
    {
      id: 'summary',
      accent: [theme.a, theme.b],
      render: () => (
        <div>
          <Title>Ton année {year} en bref</Title>
          <div className="mt-4 space-y-2">
            {[
              { l: 'Reçu', v: money(r.income), Icon: ArrowDownLeft },
              { l: 'Dépensé', v: money(r.expense), Icon: ArrowUpRight },
              { l: saved >= 0 ? 'Gardé' : 'En plus', v: money(Math.abs(saved)), Icon: PiggyBank },
              { l: 'Plus longue série', v: `${r.longest} jours`, Icon: CalendarCheck },
              ...(topCat ? [{ l: 'Catégorie n°1', v: topCat.name, Icon: Crown }] : []),
              { l: 'Profil', v: persona.name, Icon: persona.Icon },
            ].map((x, i) => (
              <div key={x.l} className="wrap-in flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgb(255 255 255 / 0.15)', animationDelay: `${200 + i * 120}ms` }}>
                <x.Icon className="w-5 h-5 shrink-0" style={{ color: WHITE }} />
                <span className="flex-1 text-[15px]" style={{ color: SOFT }}>
                  {x.l}
                </span>
                <span className="text-[16px] font-bold tabular-nums text-right truncate max-w-[55%]" style={{ color: WHITE }}>
                  {x.v}
                </span>
              </div>
            ))}
          </div>
          <ShareYear r={r} saved={saved} money={money} topCat={topCat} />
        </div>
      ),
    },
    {
      id: 'thanks',
      accent: [theme.a, theme.b],
      replay: true,
      render: () => (
        <div className="flex flex-col items-center text-center">
          <p className="wrap-in font-semibold" style={{ color: WHITE, fontSize: 40, lineHeight: 1.05 }}>
            Merci d&rsquo;avoir
          </p>
          <p className="wrap-pop font-black tracking-tight" style={{ color: WHITE, fontSize: 72, lineHeight: 1, animationDelay: '200ms' }}>
            compté
          </p>
          <p className="wrap-in font-semibold" style={{ color: WHITE, fontSize: 40, lineHeight: 1.05, animationDelay: '400ms' }}>
            avec nous
          </p>
          <p className="wrap-in text-[17px] mt-8" style={{ color: SOFT, animationDelay: '800ms' }}>
            À l&rsquo;année prochaine. Continue de noter, ta flamme t&rsquo;attend.
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="wrap-in mt-8 h-12 px-8 rounded-full text-[15px] font-bold cursor-pointer active:scale-95 transition relative z-20"
            style={{ background: WHITE, color: '#0d1015', animationDelay: '1100ms' }}
          >
            Terminer
          </button>
        </div>
      ),
    },
  ];

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const last = index === slides.length - 1;
  const press = useRef<{ t: number; x: number } | null>(null);

  // Avance automatique (sauf en pause et sur le dernier écran)
  const elapsed = useRef(0);
  useEffect(() => {
    elapsed.current = 0;
    setProgress(0);
  }, [index]);
  useEffect(() => {
    if (paused || last) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - prev;
      prev = now;
      if (elapsed.current >= DURATION) {
        elapsed.current = 0;
        setIndex((i) => Math.min(slides.length - 1, i + 1));
        return;
      }
      setProgress(elapsed.current / DURATION);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, last, index, slides.length]);

  // Clavier (ordinateur)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setIndex((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, onClose]);

  const go = (d: number) => {
    haptic();
    setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + d)));
  };

  const slide = slides[index];
  // Posé directement dans la page (pas dans la fenêtre qui l'ouvre, qui glisse) : vrai plein écran
  return createPortal(
    <div className={`fixed inset-0 z-[60] overflow-hidden select-none ${lite ? 'wrap-lite' : ''}`} data-own-leave style={{ background: '#07070B' }}>
      {slide.replay ? <ReplayBackdrop key={slide.id} year={lookYear} fireworks={slide.id === 'thanks'} /> : <Backdrop key={slide.id} accent={slide.accent} giant={slide.giant ?? null} style={theme.style} />}

      <div className="relative h-full max-w-md mx-auto flex flex-col pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Barres de progression */}
        <div className="flex gap-1 px-3">
          {slides.map((s, i) => (
            <span key={s.id} className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgb(255 255 255 / 0.3)' }}>
              <span className="block h-full rounded-full" style={{ background: WHITE, width: `${i < index ? 100 : i === index ? (last ? 100 : progress * 100) : 0}%` }} />
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 mt-3">
          <span className="flex items-center gap-2 text-[14px] font-bold" style={{ color: WHITE }}>
            <img src="/icons/wallo.svg" alt="" className="w-7 h-7 rounded-lg" /> Wallo {year}
          </span>
          <span className="flex items-center gap-2">
            {paused && <Pause className="w-4 h-4" style={{ color: SOFT }} />}
            <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer relative z-20" style={{ background: 'rgb(0 0 0 / 0.2)', color: WHITE }}>
              <X className="w-5 h-5" />
            </button>
          </span>
        </div>

        {/* Contenu de l'écran ; les zones gauche / droite servent à naviguer */}
        <div
          className="relative flex-1 flex items-center px-7"
          onPointerDown={(e) => {
            press.current = { t: Date.now(), x: e.clientX };
            setPaused(true);
          }}
          onPointerUp={(e) => {
            const p = press.current;
            press.current = null;
            setPaused(false);
            if (!p || Date.now() - p.t > 350) return; // appui long = pause seulement
            if ((e.target as HTMLElement).closest('button')) return;
            const w = (e.currentTarget as HTMLElement).getBoundingClientRect();
            go(e.clientX - w.left < w.width * 0.35 ? -1 : 1);
          }}
          onPointerCancel={() => {
            press.current = null;
            setPaused(false);
          }}
        >
          <div key={slide.id} className="w-full">
            {slide.render()}
          </div>
        </div>
        {index === 0 && (
          <p className="text-center text-[13px] wrap-in" style={{ color: SOFT, animationDelay: '1200ms' }}>
            Touche l&rsquo;écran pour avancer
          </p>
        )}
      </div>
    </div>,
    document.body
  );
};

const ShareYear: React.FC<{ r: ReturnType<typeof yearReview>; saved: number; money: (v: number) => string; topCat?: { name: string; color: string } }> = ({ r, saved, money, topCat }) => {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          const { shareYear } = await import('../lib/shareCards');
          const maxMonth = Math.max(1, ...r.months.map((m) => m.expense));
          await shareYear({
            year: r.year,
            count: r.count,
            income: money(r.income),
            expense: money(r.expense),
            saved: money(Math.abs(saved)),
            savedPositive: saved >= 0,
            longest: r.longest,
            topMonth: r.topMonth !== null ? cap(MONTHS[r.topMonth]) : '—',
            topCat: topCat ? { name: topCat.name, color: topCat.color } : null,
            months: r.months.map((m) => m.expense / maxMonth),
            notedDays: r.notedDays,
            topMonthIndex: r.topMonth,
            bestMonthIndex: r.bestMonth,
            persona: (() => {
              const p = personaOf(r);
              return { name: p.name, color: p.color, Icon: p.Icon as unknown as React.ComponentType<Record<string, unknown>> };
            })(),
          });
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="wrap-in mt-6 w-full h-14 rounded-full text-[16px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.97] transition relative z-20"
      style={{ background: WHITE, color: '#0d1015', animationDelay: '1000ms' }}
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />} Partager mon année
    </button>
  );
};

// Fond des écrans : noir, bandes lumineuses en diagonale (haut à droite, bas à gauche),
// et un chiffre géant qui brille derrière le texte.
const Backdrop: React.FC<{ accent: [string, string]; giant: string | null; style: YearStyle }> = ({ accent: [a, b], giant, style }) => {
  const band = (i: number, corner: 'tr' | 'bl') => {
    const tr = corner === 'tr';
    return (
      <span
        key={`${corner}${i}`}
        className={`absolute ${tr ? 'wrap-band-tr' : 'wrap-band-bl'}`}
        style={{
          width: '140%',
          height: 74 - i * 10,
          [tr ? 'top' : 'bottom']: `${-4 + i * 7}%`,
          [tr ? 'right' : 'left']: '-55%',
          transform: `rotate(${tr ? -38 : -38}deg)`,
          background: `linear-gradient(90deg, transparent 0%, ${tr ? a : b} 45%, ${tr ? b : a} 100%)`,
          opacity: 0.9 - i * 0.18,
          borderRadius: 999,
          filter: `blur(${i * 0.6}px)`,
          animationDelay: `${i * 90}ms`,
        }}
      />
    );
  };
  const len = giant?.length ?? 0;
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {/* Lueur générale */}
      <span className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 80% 0%, ${a}55 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, ${b}44 0%, transparent 55%)` }} />
      {style === 'bands' && (
        <>
          {[0, 1, 2].map((i) => band(i, 'tr'))}
          {[0, 1, 2].map((i) => band(i, 'bl'))}
        </>
      )}
      {style === 'orbs' && <Orbs a={a} b={b} />}
      {style === 'rings' && <Rings a={a} b={b} />}
      {style === 'equalizer' && <Equalizer a={a} b={b} />}
      {style === 'grid' && <Grid a={a} b={b} />}
      {giant && (
        <span
          className="wrap-giant absolute left-1/2 bottom-[6%] font-black leading-none tracking-tighter whitespace-nowrap"
          style={{
            fontSize: len > 4 ? '42vh' : len > 2 ? '50vh' : '62vh',
            maxWidth: '200%',
            // Couleur pleine qui s'efface vers le bas (masque) : marche partout, sans le « texte en dégradé »
            // qui se casse sur certains téléphones (rectangle de couleur visible)
            color: a,
            textShadow: `0 0 50px ${a}55`,
            maskImage: 'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.55) 45%, transparent 92%)',
            WebkitMaskImage: 'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.55) 45%, transparent 92%)',
            opacity: 0.5,
          }}
        >
          {giant}
        </span>
      )}
    </div>
  );
};

// Fond « Replay » (intro et fin) : noir, grande boule de lumière aux couleurs de l'année qui respire
const ReplayBackdrop: React.FC<{ year: number; fireworks?: boolean }> = ({ year, fireworks }) => {
  const t = yearTheme(year);
  return (
    <div className="absolute inset-0 pointer-events-none animate-fade-in" aria-hidden style={{ background: replayBg(t) }}>
      <span className="replay-orb absolute -right-24 -bottom-40 w-[130vw] h-[130vw] max-w-[620px] max-h-[620px] rounded-full" style={{ background: `radial-gradient(circle, ${t.b}88 0%, ${t.a}55 40%, transparent 70%)` }} />
      {/* Écran de fin : feux d'artifice */}
      {fireworks && <Fireworks every={1300} className="absolute inset-0" />}
    </div>
  );
};

// ---------- Décors des années (un par année, en plus des couleurs) ----------
// Bulles de lumière qui flottent (2027…)
const Orbs: React.FC<{ a: string; b: string }> = ({ a, b }) => (
  <>
    {[
      { s: 320, x: '-20%', y: '-8%', c: a, d: '0s' },
      { s: 260, x: '55%', y: '18%', c: b, d: '-3s' },
      { s: 380, x: '10%', y: '62%', c: a, d: '-6s' },
      { s: 180, x: '70%', y: '75%', c: b, d: '-2s' },
    ].map((o, i) => (
      <span key={i} className="wrap-float wrap-band-tr absolute rounded-full" style={{ width: o.s, height: o.s, left: o.x, top: o.y, background: `radial-gradient(circle at 35% 35%, ${o.c}cc 0%, ${o.c}44 45%, transparent 70%)`, animationDelay: `${i * 90}ms, ${o.d}` }} />
    ))}
  </>
);

// Anneaux qui s'élargissent depuis un coin (2028…)
const Rings: React.FC<{ a: string; b: string }> = ({ a, b }) => (
  <>
    {[0, 1, 2, 3, 4].map((i) => (
      <span key={i} className="wrap-ring absolute rounded-full" style={{ width: 560, height: 560, right: -280, top: -280, border: `${10 - i * 1.5}px solid ${i % 2 ? b : a}`, opacity: 0.5, animationDelay: `${-i * 1.2}s` }} />
    ))}
    {[0, 1, 2].map((i) => (
      <span key={`b${i}`} className="wrap-ring absolute rounded-full" style={{ width: 420, height: 420, left: -210, bottom: -210, border: `${8 - i * 2}px solid ${i % 2 ? a : b}`, opacity: 0.4, animationDelay: `${-i * 1.6}s` }} />
    ))}
  </>
);

// Égaliseur : des barres qui dansent en bas de l'écran (2029…)
const Equalizer: React.FC<{ a: string; b: string }> = ({ a, b }) => (
  <span className="absolute inset-x-0 bottom-0 h-[42%] flex items-end gap-[3%] px-[3%] opacity-70">
    {Array.from({ length: 12 }, (_, i) => (
      <span
        key={i}
        className="wrap-eq flex-1 rounded-t-full"
        style={{ height: `${30 + ((i * 37) % 60)}%`, background: `linear-gradient(180deg, ${i % 2 ? a : b} 0%, ${a}22 100%)`, animationDelay: `${-i * 0.23}s`, animationDuration: `${1.1 + (i % 4) * 0.25}s` }}
      />
    ))}
  </span>
);

// Grille rétro qui file vers l'horizon, avec un soleil (2030…)
const Grid: React.FC<{ a: string; b: string }> = ({ a, b }) => (
  <>
    <span className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ width: 260, height: 260, top: '8%', background: `linear-gradient(180deg, ${b} 0%, ${a} 100%)`, opacity: 0.5, maskImage: 'repeating-linear-gradient(180deg, #000 0 14px, transparent 14px 20px)', WebkitMaskImage: 'repeating-linear-gradient(180deg, #000 0 14px, transparent 14px 20px)' }} />
    <span className="absolute inset-x-[-50%] bottom-0 h-[45%]" style={{ perspective: 300 }}>
      <span
        className="wrap-grid absolute inset-0"
        style={{
          transform: 'rotateX(62deg)',
          transformOrigin: 'bottom',
          backgroundImage: `linear-gradient(${a}99 2px, transparent 2px), linear-gradient(90deg, ${a}99 2px, transparent 2px)`,
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(to top, #000 30%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, #000 30%, transparent 100%)',
        }}
      />
    </span>
  </>
);
