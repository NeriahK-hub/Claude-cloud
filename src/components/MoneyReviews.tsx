import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, PiggyBank, CalendarCheck, Flame, Trophy, Share2, Loader2, Sun, Sunset, Moon, Sunrise, Coins, Repeat, TrendingDown, TrendingUp, Equal, Receipt, CalendarClock, Sparkles, Play } from 'lucide-react';
import { Recurring, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { formatMoney, toMain } from '../lib/money';
import { getPrefs, useDisplayPrefs } from '../lib/display';
import { DAY_PARTS, findSubscriptions, smallExpenses, weekReview, whenYouSpend, yearReview } from '../lib/review';
import { IconBadge } from './AppIcon';
import { Amount } from './MoneyText';
import { YearWrapped, personaOf } from './YearWrapped';
import { replayBg, yearTheme } from '../lib/yearTheme';
import type { Page } from './BottomNav';

// « Comprendre son argent » (Rapport) : bilan de la semaine, bilan de l'année, quand tu dépenses,
// petites dépenses, abonnements repérés.

// Montant arrondi ; les petits montants gardent leurs centimes (« 0,40 $US » plutôt que « 0 $US »)
const useRound = (settings: Settings) => (v: number) =>
  Math.abs(v) >= 100 || v === 0 ? formatMoney(Math.round(v), settings.mainCurrency, { ...getPrefs(), decimals: 'never' }) : formatMoney(v, settings.mainCurrency, { ...getPrefs(), decimals: 'auto' });
const pctText = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const WEEKDAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// « 1er octobre », « 12 mars »
const dayMonth = (d: Date) => `${d.getDate() === 1 ? '1er' : d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'long' })}`;

const Tile: React.FC<{ label: string; children: React.ReactNode; Icon?: typeof Coins; color?: string }> = ({ label, children, Icon, color }) => (
  <div className="rounded-2xl bg-slate-100 px-3 py-3 min-w-0">
    <div className="text-[12px] text-slate-500 flex items-center gap-1.5 mb-1">
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />}
      <span className="truncate">{label}</span>
    </div>
    {children}
  </div>
);

const Big: React.FC<{ n: number | string; unit?: string; color?: string }> = ({ n, unit, color }) => (
  <div className="text-[22px] font-bold tabular-nums leading-tight whitespace-nowrap" style={{ color }}>
    {n}
    {unit && <span className="text-[13px] font-semibold text-slate-400 ml-1">{unit}</span>}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-2 mt-5 px-1">{children}</h3>
);

// Barres des catégories (top 3 ou 4)
const CatBars: React.FC<{ cats: { id: string; name: string; color: string; icon: string; image?: string; amount: number }[]; total: number; round: (v: number) => string }> = ({ cats, total, round }) => (
  <div className="rounded-2xl bg-slate-100 p-3 space-y-3">
    {cats.map((c) => (
      <div key={c.id} className="flex items-center gap-3">
        <IconBadge icon={c.icon} image={c.image} color={c.color} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold text-slate-900 truncate">{c.name}</span>
            <span className="text-[14px] font-bold tabular-nums text-slate-900 whitespace-nowrap">{round(c.amount)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full animate-bar" style={{ width: `${total > 0 ? Math.max(4, (c.amount / total) * 100) : 0}%`, background: c.color }} />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const ShareButton: React.FC<{ onShare: () => Promise<unknown>; label: string }> = ({ onShare, label }) => {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          await onShare();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="mt-5 w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition disabled:opacity-60"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} {label}
    </button>
  );
};

// Phrase « +12 % par rapport à la semaine d'avant », couleur = bonne ou mauvaise nouvelle
const Trend: React.FC<{ now: number; before: number; what: string }> = ({ now, before, what }) => {
  const p = pctText(now, before);
  if (p === null) return <span className="text-[13px] text-slate-500">Pas de dépenses {what} pour comparer.</span>;
  const Icon = p > 0 ? TrendingUp : p < 0 ? TrendingDown : Equal;
  const color = p > 0 ? '#EF4444' : p < 0 ? '#10B981' : '#64748B';
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-semibold" style={{ background: `${color}1a`, color }}>
      <Icon className="w-4 h-4" />
      {p === 0 ? `Pareil que ${what}` : `${Math.abs(p)} % ${p > 0 ? 'de plus' : 'de moins'} que ${what}`}
    </span>
  );
};

// ---------- Bilan de la semaine ----------
export const WeekTool: React.FC<{ txs: Transaction[]; settings: Settings; categories: Category[]; initialOffset?: number }> = ({ txs, settings, categories, initialOffset = 0 }) => {
  const { weekStart } = useDisplayPrefs();
  const [offset, setOffset] = useState(initialOffset);
  const round = useRound(settings);
  const r = useMemo(() => weekReview(txs, settings, categories, weekStart, offset), [txs, settings, categories, weekStart, offset]);
  const endShown = new Date(r.end.getTime() - 86400000);
  const range = `${r.start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${endShown.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
  const title = offset === 0 ? 'Cette semaine' : offset === -1 ? 'La semaine dernière' : `Il y a ${-offset} semaines`;
  const max = Math.max(1, ...r.days.map((d) => d.amount));
  const empty = r.count === 0;
  const n = new Date();
  const todayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();

  return (
    <div>
      <div className="flex items-center justify-between bg-slate-100 rounded-full p-1 mb-4">
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Semaine d'avant" className="w-9 h-9 rounded-full hover:bg-white flex items-center justify-center cursor-pointer transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-center">
          <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
          <span className="block text-[11px] text-slate-500">{range}</span>
        </span>
        <button onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label="Semaine d'après" className="w-9 h-9 rounded-full hover:bg-white flex items-center justify-center cursor-pointer transition disabled:opacity-25 disabled:cursor-default">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {empty ? (
        <p className="text-center text-[14px] text-slate-500 py-10">Aucune opération cette semaine-là.</p>
      ) : (
        <div key={offset} className="animate-fade-in">
          <div className="text-center">
            <div className="text-[13px] text-slate-500">Tu as dépensé</div>
            <div className="text-[38px] font-extrabold tracking-tight tabular-nums text-slate-900 leading-tight whitespace-nowrap">{round(r.spent)}</div>
            <div className="mt-1.5">
              <Trend now={r.spent} before={r.prevSpent} what="la semaine d'avant" />
            </div>
          </div>

          {/* Les 7 jours */}
          <div className="mt-5 rounded-2xl bg-slate-100 p-3">
            <div className="flex items-end gap-1.5 h-28">
              {r.days.map((d) => {
                const top = r.topDay && d.date.getTime() === r.topDay.date.getTime();
                const free = d.amount === 0 && d.date.getTime() < todayStart; // aujourd'hui n'est pas fini
                return (
                  <div key={d.date.toISOString()} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
                    <div
                      className="w-full rounded-lg animate-bar-up"
                      style={{ height: `${d.future ? 4 : Math.max(4, (d.amount / max) * 100)}%`, background: d.future ? 'var(--color-slate-200)' : top ? '#EF4444' : free ? '#10B981' : 'var(--color-slate-300)' }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {r.days.map((d) => (
                <span key={d.date.toISOString()} className="flex-1 text-center text-[11px] font-semibold text-slate-500">
                  {d.date.toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase()}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-center gap-4 mt-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Jour le plus cher</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Sans dépense</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <Tile label="Tu as reçu" Icon={ArrowDownLeft} color="#10B981">
              <Amount text={round(r.received)} tone="#10B981" />
            </Tile>
            <Tile label="Sans dépense" Icon={CalendarCheck} color="#10B981">
              <Big n={r.freeDays} unit={r.freeDays > 1 ? 'jours' : 'jour'} />
            </Tile>
          </div>

          {r.topDay && (
            <div className="mt-2 rounded-2xl bg-red-500/10 p-3.5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5 text-red-500" />
              </span>
              <span className="text-[14px] text-slate-700 leading-snug">
                Ton jour le plus cher&nbsp;: <b className="text-slate-900">{WEEKDAYS_LONG[r.topDay.date.getDay()]}</b>, avec <b className="text-slate-900 whitespace-nowrap">{round(r.topDay.amount)}</b>.
              </span>
            </div>
          )}

          {r.cats.length > 0 && (
            <>
              <SectionTitle>Où est parti l&rsquo;argent</SectionTitle>
              <CatBars cats={r.cats.slice(0, 3)} total={r.spent} round={round} />
            </>
          )}

          <ShareButton
            label="Partager ma semaine"
            onShare={async () => {
              const { shareWeek } = await import('../lib/shareCards');
              return shareWeek({ range, spent: round(r.spent), received: round(r.received), freeDays: r.freeDays, days: r.days.map((d) => ({ label: d.date.toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase(), ratio: d.future ? 0 : d.amount / max, top: !!r.topDay && d.date.getTime() === r.topDay.date.getTime(), free: d.amount === 0 && d.date.getTime() < todayStart })), top: r.cats.slice(0, 3).map((c) => ({ name: c.name, color: c.color, amount: round(c.amount) })) });
            }}
          />
        </div>
      )}
    </div>
  );
};

// ---------- Bilan de l'année ----------
export const YearTool: React.FC<{ txs: Transaction[]; settings: Settings; categories: Category[]; initialYear?: number; autoStory?: boolean }> = ({ txs, settings, categories, initialYear, autoStory }) => {
  const [story, setStory] = useState(!!autoStory);
  const now = new Date();
  const firstYear = useMemo(() => Math.min(now.getFullYear(), ...txs.map((t) => new Date(t.createdAt).getFullYear())), [txs]); // eslint-disable-line react-hooks/exhaustive-deps
  const [year, setYear] = useState(initialYear ?? now.getFullYear());
  const round = useRound(settings);
  const r = useMemo(() => yearReview(txs, settings, categories, year), [txs, settings, categories, year]);
  const saved = r.income - r.expense;
  const maxMonth = Math.max(1, ...r.months.map((m) => m.expense));

  return (
    <div>
      <div className="flex items-center justify-between bg-slate-100 rounded-full p-1 mb-4">
        <button onClick={() => setYear((y) => Math.max(firstYear, y - 1))} disabled={year <= firstYear} aria-label="Année d'avant" className="w-9 h-9 rounded-full hover:bg-white flex items-center justify-center cursor-pointer transition disabled:opacity-25 disabled:cursor-default">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[15px] font-semibold text-slate-900">{year}</span>
        <button onClick={() => setYear((y) => Math.min(now.getFullYear(), y + 1))} disabled={year >= now.getFullYear()} aria-label="Année d'après" className="w-9 h-9 rounded-full hover:bg-white flex items-center justify-center cursor-pointer transition disabled:opacity-25 disabled:cursor-default">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {r.count === 0 ? (
        <p className="text-center text-[14px] text-slate-500 py-10">Aucune opération en {year}.</p>
      ) : (
        <div key={year} className="animate-fade-in space-y-2">
          {/* En-tête façon « Replay » : fond sombre, boule de lumière aux couleurs de l'année ; le toucher lance la story */}
          {(() => {
            const t = yearTheme(year);
            return (
              <button
                onClick={() => setStory(true)}
                className="w-full relative overflow-hidden rounded-[28px] px-5 pt-9 pb-7 text-center cursor-pointer active:scale-[0.99] transition"
                style={{ background: replayBg(t) }}
              >
                <span className="replay-orb absolute -right-16 -bottom-24 w-72 h-72 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${t.b}66 0%, ${t.a}33 45%, transparent 70%)` }} />
                <span className="relative block text-[30px] font-bold tracking-tight leading-tight" style={{ color: '#fff' }}>
                  Voici ton année <span style={{ color: t.hi }}>{year}</span>.
                </span>
                <span className="relative block text-[13px] mt-1.5" style={{ color: 'rgb(255 255 255 / 0.7)' }}>
                  {r.count.toLocaleString('fr-FR')} opérations notées sur {r.notedDays} jours
                </span>
                <span className="relative mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-bold" style={{ background: '#fff', color: '#050807' }}>
                  Revivre <Play className="w-3 h-3" fill="#050807" />
                </span>
              </button>
            );
          })()}
          {story && <YearWrapped txs={txs} settings={settings} categories={categories} year={year} round={round} onClose={() => setStory(false)} />}

          <div className="grid grid-cols-2 gap-2">
            <Tile label="Tu as reçu" Icon={ArrowDownLeft} color="#10B981">
              <Amount text={round(r.income)} tone="#10B981" size="lg" />
            </Tile>
            <Tile label="Tu as dépensé" Icon={ArrowUpRight} color="#EF4444">
              <Amount text={round(r.expense)} tone="#EF4444" size="lg" />
            </Tile>
          </div>
          <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: saved >= 0 ? 'rgb(16 185 129 / 0.12)' : 'rgb(239 68 68 / 0.1)' }}>
            <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: saved >= 0 ? 'rgb(16 185 129 / 0.18)' : 'rgb(239 68 68 / 0.15)' }}>
              <PiggyBank className="w-5 h-5" style={{ color: saved >= 0 ? '#10B981' : '#EF4444' }} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] text-slate-600">{saved >= 0 ? 'Il t’est resté' : 'Tu as dépensé en plus'}</span>
              <span className="block text-[20px] font-bold tabular-nums whitespace-nowrap" style={{ color: saved >= 0 ? '#10B981' : '#EF4444' }}>
                {round(Math.abs(saved))}
              </span>
            </span>
          </div>

          {/* Les 12 mois */}
          <SectionTitle>Tes dépenses mois par mois</SectionTitle>
          <div className="rounded-2xl bg-slate-100 p-3">
            <div className="flex items-end gap-1 h-28">
              {r.months.map((m) => (
                <div key={m.m} className="flex-1 h-full flex flex-col justify-end">
                  <div className="w-full rounded-md animate-bar-up" style={{ height: `${Math.max(3, (m.expense / maxMonth) * 100)}%`, background: m.m === r.topMonth ? '#EF4444' : m.m === r.bestMonth ? '#10B981' : 'var(--color-slate-300)' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1.5">
              {r.months.map((m) => (
                <span key={m.m} className="flex-1 text-center text-[10px] font-semibold text-slate-500">
                  {MONTHS[m.m].charAt(0).toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {r.topMonth !== null && (
              <Tile label="Mois le plus cher" Icon={Flame} color="#EF4444">
                <div className="text-[17px] font-bold text-slate-900">{cap(MONTHS[r.topMonth])}</div>
                <div className="text-[12px] text-slate-500 tabular-nums whitespace-nowrap">{round(r.months[r.topMonth].expense)}</div>
              </Tile>
            )}
            {r.bestMonth !== null && (
              <Tile label="Meilleur mois" Icon={Trophy} color="#10B981">
                <div className="text-[17px] font-bold text-slate-900">{cap(MONTHS[r.bestMonth])}</div>
                <div className="text-[12px] text-slate-500 leading-tight">le plus d&rsquo;argent gardé</div>
              </Tile>
            )}
            <Tile label="Plus longue série" Icon={Flame} color="#F97316">
              <Big n={r.longest} unit={r.longest > 1 ? 'jours' : 'jour'} />
            </Tile>
            <Tile label="Jours sans dépense" Icon={CalendarCheck} color="#10B981">
              <Big n={r.freeDays} unit={r.freeDays > 1 ? 'jours' : 'jour'} />
            </Tile>
          </div>

          {r.cats.length > 0 && (
            <>
              <SectionTitle>Tes catégories n°1</SectionTitle>
              <CatBars cats={r.cats.slice(0, 3)} total={r.expense} round={round} />
            </>
          )}
          {r.biggest && (
            <div className="rounded-2xl bg-slate-100 p-3.5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5 text-amber-500" />
              </span>
              <span className="min-w-0 text-[14px] text-slate-700 leading-snug">
                Ta plus grosse dépense&nbsp;: <b className="text-slate-900">{r.biggest.title || r.biggest.category}</b>,{' '}
                <b className="text-slate-900 whitespace-nowrap">{round(-toMain(r.biggest.amount, r.biggest.currency, settings))}</b> le {dayMonth(new Date(r.biggest.createdAt))}.
              </span>
            </div>
          )}

          <ShareButton
            label="Partager mon année"
            onShare={async () => {
              const { shareYear } = await import('../lib/shareCards');
              return shareYear({
                year,
                count: r.count,
                income: round(r.income),
                expense: round(r.expense),
                saved: round(Math.abs(saved)),
                savedPositive: saved >= 0,
                longest: r.longest,
                topMonth: r.topMonth !== null ? cap(MONTHS[r.topMonth]) : '—',
                topCat: r.cats[0] ? { name: r.cats[0].name, color: r.cats[0].color } : null,
                months: r.months.map((m) => m.expense / maxMonth),
                notedDays: r.notedDays,
                topMonthIndex: r.topMonth,
                bestMonthIndex: r.bestMonth,
                persona: (() => {
                  const p = personaOf(r);
                  return { name: p.name, color: p.color, Icon: p.Icon as unknown as React.ComponentType<Record<string, unknown>> };
                })(),
              });
            }}
          />
        </div>
      )}
    </div>
  );
};

// ---------- Quand tu dépenses ----------
const PART_ICON = { morning: Sunrise, afternoon: Sun, evening: Sunset, night: Moon };
const PART_COLOR = { morning: '#F59E0B', afternoon: '#F97316', evening: '#8B5CF6', night: '#3B82F6' };

export const WhenTool: React.FC<{ txs: Transaction[]; settings: Settings }> = ({ txs, settings }) => {
  const round = useRound(settings);
  const r = useMemo(() => whenYouSpend(txs, settings), [txs, settings]);
  const order = [1, 2, 3, 4, 5, 6, 0]; // lundi d'abord
  const max = Math.max(1, ...r.perWeekday);
  const top = r.perWeekday.indexOf(Math.max(...r.perWeekday));
  const low = r.perWeekday.indexOf(Math.min(...r.perWeekday));
  const partMax = Math.max(1, ...r.parts.map((p) => p.total));
  const topPart = r.parts.reduce((a, b) => (b.total > a.total ? b : a));
  if (r.count < 5) return <p className="text-center text-[14px] text-slate-500 py-10">Note encore quelques dépenses&nbsp;: il en faut au moins 5 sur les 3 derniers mois.</p>;
  return (
    <div>
      <div className="rounded-2xl bg-red-500/10 p-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
          <Flame className="w-5 h-5 text-red-500" />
        </span>
        <span className="text-[15px] text-slate-700 leading-snug">
          Le <b className="text-slate-900">{WEEKDAYS_LONG[top]}</b> est ton jour le plus cher&nbsp;: <b className="text-slate-900 whitespace-nowrap">{round(r.perWeekday[top])}</b> en moyenne.
        </span>
      </div>

      <SectionTitle>Jour par jour (en moyenne)</SectionTitle>
      <div className="rounded-2xl bg-slate-100 p-3 space-y-2">
        {order.map((d) => (
          <div key={d} className="flex items-center gap-3">
            <span className={`w-20 text-[13px] ${d === top ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{cap(WEEKDAYS_LONG[d])}</span>
            <span className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
              <span className="block h-full rounded-full animate-bar" style={{ width: `${Math.max(3, (r.perWeekday[d] / max) * 100)}%`, background: d === top ? '#EF4444' : d === low ? '#10B981' : 'var(--color-slate-400)' }} />
            </span>
            <span className="w-24 text-right text-[13px] font-semibold tabular-nums text-slate-900 whitespace-nowrap">{round(r.perWeekday[d])}</span>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-slate-500 mt-2 px-1">Le {WEEKDAYS_LONG[low]} est ton jour le plus calme.</p>

      {r.timedCount >= 5 && (
        <>
          <SectionTitle>Moment de la journée</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {r.parts.map((p) => {
              const Icon = PART_ICON[p.id];
              const color = PART_COLOR[p.id];
              return (
                <div key={p.id} className="rounded-2xl p-3" style={{ background: p.id === topPart.id ? `${color}1f` : 'var(--color-slate-100)' }}>
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 shrink-0" style={{ color }} />
                    <span className="text-[13px] font-semibold text-slate-900">{p.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mb-1.5">{p.hint}</div>
                  <Amount text={round(p.total)} />
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full animate-bar" style={{ width: `${(p.total / partMax) * 100}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[12px] text-slate-500 mt-2 px-1 leading-snug">
            C&rsquo;est surtout {topPart.label.toLowerCase()} que l&rsquo;argent part. Selon l&rsquo;heure où tu as noté tes dépenses.
          </p>
        </>
      )}
    </div>
  );
};

// ---------- Petites dépenses ----------
export const SmallTool: React.FC<{ txs: Transaction[]; settings: Settings; categories: Category[] }> = ({ txs, settings, categories }) => {
  const round = useRound(settings);
  const r = useMemo(() => smallExpenses(txs, settings, categories), [txs, settings, categories]);
  if (r.count === 0) return <p className="text-center text-[14px] text-slate-500 py-10">Pas de petites dépenses ces 30 derniers jours.</p>;
  return (
    <div>
      <p className="text-[13px] text-slate-500 mb-4 px-1">Moins de <b className="text-slate-700 whitespace-nowrap">{round(r.limit)}</b> chacune.</p>
      <div className="relative overflow-hidden rounded-[28px] p-5 text-center" style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
        <div className="text-[13px] font-semibold" style={{ color: 'rgb(255 255 255 / 0.85)' }}>
          Sur un an, elles font
        </div>
        <div className="text-[36px] font-extrabold tabular-nums leading-tight whitespace-nowrap" style={{ color: '#fff' }}>
          ≈ {round(r.yearly)}
        </div>
        <div className="text-[13px] mt-1" style={{ color: 'rgb(255 255 255 / 0.9)' }}>
          si tu continues comme ce mois-ci
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <Tile label="En 30 jours">
          <Amount text={round(r.total)} />
        </Tile>
        <Tile label="Par jour">
          <Amount text={round(r.perDay)} />
        </Tile>
        <Tile label="Combien">
          <Big n={r.count} unit="fois" />
        </Tile>
      </div>
      <p className="text-[13px] text-slate-600 mt-3 px-1 leading-snug">
        Elles font <b className="text-slate-900">{Math.round(r.share * 100)}&nbsp;%</b> de tout ce que tu as dépensé. Une par jour en moins, c&rsquo;est déjà de l&rsquo;épargne.
      </p>
      {r.cats.length > 0 && (
        <>
          <SectionTitle>Les plus fréquentes</SectionTitle>
          <CatBars cats={r.cats} total={r.total} round={round} />
        </>
      )}
    </div>
  );
};

// ---------- Abonnements repérés ----------
export const SubsTool: React.FC<{ txs: Transaction[]; settings: Settings; categories: Category[]; recurrings: Recurring[]; onNavigate?: (p: Page) => void }> = ({ txs, settings, categories, recurrings, onNavigate }) => {
  const round = useRound(settings);
  const list = useMemo(() => findSubscriptions(txs, settings, categories, recurrings), [txs, settings, categories, recurrings]);
  const total = list.reduce((s, x) => s + x.amount, 0);
  if (!list.length)
    return (
      <div className="text-center py-10">
        <Repeat className="w-8 h-8 mx-auto text-slate-300 mb-2" />
        <p className="text-[14px] text-slate-500 max-w-[280px] mx-auto">Aucun abonnement repéré. Wallo cherche les dépenses avec le même nom, chaque mois, depuis au moins 3 mois.</p>
      </div>
    );
  return (
    <div>
      <p className="text-[14px] text-slate-500 mb-4 leading-snug">Des dépenses qui reviennent chaque mois avec le même montant. Les oublier coûte cher&nbsp;: vérifie que tu en as encore besoin.</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Tile label="Chaque mois" Icon={Repeat} color="#8B5CF6">
          <Amount text={round(total)} size="lg" />
        </Tile>
        <Tile label="Sur un an" Icon={CalendarClock} color="#EF4444">
          <Amount text={round(total * 12)} tone="#EF4444" size="lg" />
        </Tile>
      </div>
      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
        {list.map((x) => (
          <div key={x.key} className="flex items-center gap-3 px-3.5 py-3">
            <IconBadge icon={x.icon} image={x.image} color={x.color} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-slate-900 line-clamp-2">{x.name}</div>
              <div className="text-[12px] text-slate-500">
                Prochaine fois vers le {x.next.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                {x.known && <span className="text-emerald-600 font-semibold"> · déjà dans À venir</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[14px] font-bold tabular-nums text-slate-900 whitespace-nowrap">{round(x.amount)}</div>
              <div className="text-[11px] text-slate-500">par mois</div>
            </div>
          </div>
        ))}
      </div>
      {onNavigate && list.some((x) => !x.known) && (
        <button onClick={() => onNavigate('upcoming')} className="mt-4 w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
          <CalendarClock className="w-4 h-4" /> Les ajouter dans « À venir »
        </button>
      )}
    </div>
  );
};
