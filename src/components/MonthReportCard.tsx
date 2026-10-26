import React, { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../lib/usage';
import { ChevronDown, ChevronRight, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { Recurring, Settings, Transaction, Wallet } from '../types';
import { occurrencesBetween, ymd } from '../lib/recurring';
import { countsInReport, fitAmount, formatMoney, toMain, walletBalance } from '../lib/money';
import { inPeriod, periodRange } from '../lib/periods';
import { formatDate, useDisplayPrefs } from '../lib/display';
import { haptic } from '../lib/haptics';
import { monthGoalProgress } from '../lib/goals';
import { getPrefs } from '../lib/display';

interface MonthReportCardProps {
  allTransactions: Transaction[];
  wallets: Wallet[];
  activeWallet: Wallet | null; // null = portefeuilles comptés dans le total
  settings: Settings;
  onOpenReports: () => void;
  onOpenGoals?: () => void; // ligne « tu as avancé de 18 % vers Moto »
  recurrings?: Recurring[]; // factures prévues (« À venir ») : prévision de fin de mois plus juste
}

type Side = 'expense' | 'income';

const H = 150; // hauteur du tracé (px)
const PAD = { top: 10, right: 44, bottom: 22, left: 4 }; // axe des montants à droite

// Montant court pour l'axe : 640 000 -> « 640 k », 1 200 000 -> « 1,2 M »
const compact = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `${Math.round(v / 1e3)} k` : String(Math.round(v));

// Graduation « ronde » : 1, 2 ou 5 × une puissance de 10, environ 3 intervalles
function niceStep(max: number) {
  const raw = max / 3;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
}

// Largeur réelle du conteneur (pour dessiner net, sans déformer les traits)
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Accueil : dépenses (ou revenus) cumulées jour après jour ce mois-ci,
// comparées à la moyenne des 3 mois précédents au même jour du mois.
export const MonthReportCard: React.FC<MonthReportCardProps> = ({ allTransactions, wallets, activeWallet, settings, onOpenReports, onOpenGoals, recurrings = [] }) => {
  const [side, setSide] = useState<Side>('expense');
  const [hover, setHover] = useState<number | null>(null);
  const [how, setHow] = useState(false); // « Comment c'est calculé ? » // jour survolé (index 0 = le 1er)
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const main = settings.mainCurrency;

  const prefs = useDisplayPrefs(); // premier jour du mois, format de date
  const data = useMemo(() => {
    const scope = activeWallet ? [activeWallet] : wallets.filter((w) => w.includeInTotal && !w.archived);
    const ids = new Set(scope.map((w) => w.id));
    const now = new Date();
    // Nombre de jours entre deux dates (sans se tromper aux changements d'heure)
    const dayIndex = (from: Date, to: Date) =>
      Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000);
    const range = (offset: number) => periodRange({ kind: 'month', offset }, now) as { start: Date; end: Date };
    const cur = range(0);
    const days = dayIndex(cur.start, cur.end);
    const today = Math.min(days, dayIndex(cur.start, now) + 1);

    // Montant par jour du mois, pour un mois donné (décalage 0 = ce mois-ci)
    const perDay = (offset: number, s: Side) => {
      const r = range(offset);
      const arr = new Array<number>(dayIndex(r.start, r.end)).fill(0);
      for (const t of allTransactions) {
        if (!ids.has(t.walletId) || !countsInReport(t, activeWallet ? null : ids) || (s === 'expense' ? t.amount >= 0 : t.amount <= 0)) continue;
        if (!inPeriod(t.createdAt, r)) continue;
        arr[dayIndex(r.start, new Date(t.createdAt))] += Math.abs(toMain(t.amount, t.currency, settings));
      }
      return arr;
    };
    const cumulate = (arr: number[], len: number) => {
      const out: number[] = [];
      let acc = 0;
      for (let i = 0; i < len; i++) out.push((acc += arr[i] ?? 0)); // mois plus court : on garde le dernier total
      return out;
    };

    const build = (s: Side) => {
      const current = cumulate(perDay(0, s), today);
      const past = [-1, -2, -3].map((o) => cumulate(perDay(o, s), days));
      const average = Array.from({ length: days }, (_, i) => (past[0][i] + past[1][i] + past[2][i]) / 3);
      return { current, average, total: current[today - 1] ?? 0 };
    };
    const expense = build('expense');
    const income = build('income');

    // Prévision de fin de mois : solde d'aujourd'hui + ce qui reste habituellement à venir.
    // Avec un historique : ce que les 3 derniers mois ont dépensé (ou gagné) après ce jour-ci
    // (le loyer de fin de mois, le salaire…) ; sans historique : le rythme de ce mois-ci.
    const left = days - today; // jours restants après aujourd'hui
    const after = (b: { average: number[] }) => Math.max(0, (b.average[days - 1] ?? 0) - (b.average[today - 1] ?? 0));
    const hasHistory = expense.average[days - 1] > 0;
    // Plus juste : on mélange l'habitude des 3 derniers mois et le rythme de ce mois-ci (dès 5 jours),
    // puis on s'assure de compter au moins les factures déjà prévues dans « À venir ».
    const pace = today >= 5 ? (expense.total / today) * left : null;
    const habit = hasHistory ? after(expense) : null;
    const blended = habit !== null && pace !== null ? habit * 0.6 + pace * 0.4 : habit ?? pace;
    const todayStr = ymd(now);
    const to = ymd(new Date(cur.end.getTime() - 1));
    let billsOut = 0;
    let billsIn = 0;
    for (const r of recurrings) {
      if (!r.active || !r.amount || !ids.has(r.walletId)) continue;
      // (ce qui est dû aujourd'hui ou en retard compte aussi : ce n'est pas encore payé, donc pas encore dans le solde)
      const n = occurrencesBetween(r, r.nextDate < todayStr ? r.nextDate : todayStr, to).length;
      const v = toMain(r.amount, r.currency, settings) * n;
      if (r.direction === 'out') billsOut += v;
      else billsIn += v;
    }
    const expenseAhead = blended === null ? (billsOut > 0 ? billsOut : null) : Math.max(blended, billsOut);
    const incomeAhead = Math.max(income.average[days - 1] > 0 ? after(income) : 0, billsIn);
    const balance = scope.reduce((sum, w) => sum + toMain(walletBalance(w, allTransactions), w.currency, settings), 0);
    const forecast =
      left > 0 && expenseAhead !== null ? { left, balance, end: balance + incomeAhead - expenseAhead, expenseAhead, incomeAhead, hasHistory, billsOut } : null;
    return { days, today, start: cur.start, expense, income, forecast };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTransactions, wallets, activeWallet, settings, prefs, recurrings]);

  // Objectifs : de combien ils ont avancé depuis le début du mois (le portefeuille choisi, ou tous)
  const goals = useMemo(
    () => monthGoalProgress(activeWallet ? [activeWallet] : wallets, allTransactions, data.start),
    [activeWallet, wallets, allTransactions, data.start]
  );
  const hasGoals = (activeWallet ? [activeWallet] : wallets).some((w) => w.kind === 'goal' && !w.archived);

  const series = data[side];
  const hasData = series.total > 0 || series.average.some((v) => v > 0);
  const day = hover ?? data.today - 1;
  // Suite probable du mois (pointillés) : d'aujourd'hui au dernier jour, au rythme de la prévision
  const ahead = data.forecast ? (side === 'expense' ? data.forecast.expenseAhead : data.forecast.incomeAhead) : 0;
  const lastIdx = series.current.length - 1;
  const projected = ahead > 0 && lastIdx >= 0 && lastIdx < data.days - 1 ? series.total + ahead : null;
  const projAt = (i: number) => (projected === null ? null : series.total + (ahead * (i - lastIdx)) / (data.days - 1 - lastIdx));
  const future = day > lastIdx;
  const cur = !future ? series.current[day] ?? null : projAt(day);
  const avg = series.average[day] ?? 0;
  const money = (v: number) => formatMoney(v, main);
  // Prévision : un ordre d'idée, donc arrondi (pas de centimes)
  const about = (v: number) => formatMoney(Math.round(v), main, { ...getPrefs(), decimals: 'never' });
  const dateLabel = (i: number) => formatDate(new Date(data.start.getFullYear(), data.start.getMonth(), data.start.getDate() + i), true);


  // Géométrie
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const max = Math.max(1, ...series.current, ...series.average, projected ?? 0);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const x = (i: number) => PAD.left + (data.days > 1 ? (i / (data.days - 1)) * plotW : 0);
  const yv = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yv(v).toFixed(1)}`).join('');
  const area = series.current.length
    ? `${path(series.current)}L${x(series.current.length - 1).toFixed(1)},${yv(0)}L${x(0)},${yv(0)}Z`
    : '';

  const pickDay = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const rel = (clientX - r.left - PAD.left) / (plotW || 1);
    const next = Math.max(0, Math.min(data.days - 1, Math.round(rel * (data.days - 1))));
    if (next !== hover) haptic();
    setHover(next);
  };
  const pickRef = useRef(pickDay);
  pickRef.current = pickDay;

  // Doigt sur le graphique : un geste plutôt horizontal lit les jours (la page ne défile pas),
  // un geste vertical fait défiler la page comme d'habitude. Le jour choisi reste affiché après.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    let mode: 'read' | 'scroll' | null = null;
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      mode = null;
      pickRef.current(t.clientX, el);
    };
    const move = (e: TouchEvent) => {
      if (!start || mode === 'scroll') return;
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - start.x);
      const dy = Math.abs(t.clientY - start.y);
      if (!mode && dx + dy > 6) mode = dx >= dy ? 'read' : 'scroll';
      if (mode === 'read') {
        e.preventDefault();
        pickRef.current(t.clientX, el);
      }
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchmove', move);
    };
  }, [boxRef, width]);

  const tab = (s: Side, label: string, value: number) => (
    <button
      onClick={() => {
        haptic();
        setSide(s);
      }}
      aria-pressed={side === s}
      className={`flex-1 min-w-0 pb-2 text-center cursor-pointer border-b-2 transition-colors ${side === s ? 'chart-underline' : 'border-slate-100'}`}
    >
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`${fitAmount(money(value), 'base')} font-bold tabular-nums whitespace-nowrap transition-opacity ${s === 'expense' ? 'text-rose-600' : 'text-emerald-600'} ${side === s ? '' : 'opacity-60'}`}>{money(value)}</div>
    </button>
  );

  return (
    <div className={`bg-white rounded-3xl border border-slate-100 p-4 ${side === 'expense' ? 'chart-exp' : 'chart-inc'}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">Rapport de ce mois</h2>
        <button onClick={() => { track('home.month'); onOpenReports(); }} className="flex items-center gap-0.5 text-xs font-bold text-emerald-700 cursor-pointer">
          Voir les rapports <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-3 mb-3">
        {tab('expense', 'Total dépensé', data.expense.total)}
        {tab('income', 'Total des revenus', data.income.total)}
      </div>

      {!hasData ? (
        <p className="text-sm text-slate-400 text-center py-8">Rien à comparer pour l'instant : ajoute des opérations.</p>
      ) : (
        <>
          {/* Lecture du jour survolé (aujourd'hui par défaut) : la valeur d'abord, le nom ensuite */}
          {/* Lecture en phrases simples : ce mois-ci, d'habitude, et la différence */}
          <div className="rounded-2xl bg-slate-100 px-3.5 py-3 mb-2" aria-live="polite">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 mb-2">
              <span>{day === data.today - 1 ? `Aujourd'hui, ${dateLabel(day)}` : `Au ${dateLabel(day)}`}</span>
              {day !== data.today - 1 && (
                <button type="button" onClick={() => setHover(null)} className="text-emerald-700 cursor-pointer">
                  Revenir à aujourd'hui
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="w-3 h-0.5 rounded-full chart-key-series shrink-0" />
              <span className="text-slate-500">{future ? 'Prévu' : 'Ce mois-ci'}</span>
              <span className="ml-auto font-bold text-slate-900 tabular-nums whitespace-nowrap">{cur === null ? '—' : future ? `≈ ${about(cur)}` : money(cur)}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] mt-1">
              <span className="w-3 shrink-0 border-t-2 border-dashed" style={{ borderColor: 'var(--ref)' }} />
              <span className="text-slate-500">D'habitude</span>
              <span className="ml-auto font-bold text-slate-900 tabular-nums whitespace-nowrap">{money(avg)}</span>
            </div>
            {cur !== null && avg > 0 && Math.abs(cur - avg) >= Math.max(1, avg * 0.01) && (() => {
              const more = cur > avg;
              // Dépenser moins ou gagner plus que d'habitude : bon signe (vert) ; l'inverse : à surveiller (orange)
              const good = side === 'expense' ? !more : more;
              const Icon = more ? TrendingUp : TrendingDown;
              return (
                <div className={`mt-2.5 pt-2.5 border-t border-slate-200/70 flex items-center gap-2 text-[12.5px] font-semibold ${good ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="tabular-nums">{about(Math.abs(cur - avg))}</span> de {more ? 'plus' : 'moins'} que d'habitude
                  </span>
                </div>
              );
            })()}
            <p className="text-[11px] text-slate-400 mt-2">« D'habitude » : la moyenne de tes 3 derniers mois, au même jour.</p>
          </div>

          <div ref={boxRef} className="relative select-none">
            {width > 0 && (
              <svg
                width={width}
                height={H}
                role="img"
                aria-label={`${side === 'expense' ? 'Dépenses' : 'Revenus'} cumulées ce mois-ci comparées à la moyenne des 3 mois précédents`}
                tabIndex={0}
                className="block outline-none touch-pan-y"
                onPointerMove={(e) => e.pointerType === 'mouse' && pickDay(e.clientX, e.currentTarget)}
                onPointerDown={(e) => e.pointerType === 'mouse' && pickDay(e.clientX, e.currentTarget)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') setHover(Math.max(0, day - 1));
                  else if (e.key === 'ArrowRight') setHover(Math.min(data.days - 1, day + 1));
                  else return;
                  e.preventDefault();
                }}
              >
                {/* Grille : traits fins, discrets ; montants à droite */}
                {ticks.map((t) => (
                  <g key={t}>
                    <line x1={PAD.left} x2={PAD.left + plotW} y1={yv(t)} y2={yv(t)} className="stroke-slate-100" strokeWidth={1} />
                    <text x={width - 2} y={yv(t) + 4} textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">
                      {compact(t)}
                    </text>
                  </g>
                ))}
                <text x={PAD.left} y={H - 4} className="fill-slate-400 text-[11px]">{dateLabel(0)}</text>
                <text x={PAD.left + plotW} y={H - 4} textAnchor="end" className="fill-slate-400 text-[11px]">{dateLabel(data.days - 1)}</text>

                {/* Moyenne (référence grise) puis ce mois-ci (couleur + voile léger) */}
                <path d={path(series.average)} fill="none" className="chart-ref" strokeWidth={1.75} strokeDasharray="3 4" strokeLinejoin="round" strokeLinecap="round" />
                {area && <path d={area} className="chart-area" />}
                {projected !== null && (
                  <>
                    <path
                      d={`M${x(lastIdx).toFixed(1)},${yv(series.total).toFixed(1)}L${x(data.days - 1).toFixed(1)},${yv(projected).toFixed(1)}`}
                      fill="none"
                      className="chart-series"
                      strokeWidth={2}
                      strokeDasharray="2 5"
                      strokeLinecap="round"
                      opacity={0.55}
                    />
                    <circle cx={x(data.days - 1)} cy={yv(projected)} r={3.5} fill="none" className="chart-series" strokeWidth={2} opacity={0.55} />
                  </>
                )}
                <path d={path(series.current)} fill="none" className="chart-series" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />

                {/* Repère du jour lu */}
                <line x1={x(day)} x2={x(day)} y1={PAD.top} y2={yv(0)} className="stroke-slate-300" strokeWidth={1} />
                {cur !== null && <circle cx={x(day)} cy={yv(cur)} r={4.5} className="chart-dot" strokeWidth={2} />}
              </svg>
            )}
          </div>
          <p className="text-[11px] text-slate-400 text-center mt-0.5">Glisse ton doigt sur le graphique pour voir chaque jour.</p>

          {data.forecast && (
            <div className={`mt-3 rounded-2xl px-3.5 py-3 ${data.forecast.end < 0 ? 'bg-red-500/10' : 'bg-slate-100'}`}>
              <div className="text-[12px] font-semibold text-slate-500">Ton solde à la fin du mois</div>
              <div className={`mt-1 text-[22px] leading-tight font-bold tabular-nums break-words ${data.forecast.end < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                ≈ {about(data.forecast.end)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-slate-500 tabular-nums">
                <span>Aujourd'hui : {about(data.forecast.balance)}</span>
                {Math.round(data.forecast.end - data.forecast.balance) !== 0 && (
                  <span className={`font-semibold whitespace-nowrap ${data.forecast.end >= data.forecast.balance ? 'text-emerald-600' : 'text-slate-600'}`}>
                    ({data.forecast.end >= data.forecast.balance ? '+' : '−'}
                    {about(Math.abs(data.forecast.end - data.forecast.balance))})
                  </span>
                )}
              </div>
              {data.forecast.end < 0 && <p className="text-[12px] font-semibold text-red-600 mt-1.5">Attention : tu risques de manquer d'argent.</p>}
              <button
                type="button"
                onClick={() => setHow((v) => !v)}
                aria-expanded={how}
                className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 cursor-pointer"
              >
                Comment c'est calculé ?
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${how ? 'rotate-180' : ''}`} />
              </button>
              {how && (
                <div className="mt-2 text-[12px] leading-snug text-slate-500 space-y-1 animate-fade-in">
                  <p>
                    Ton solde d'aujourd'hui, <b className="text-slate-700">moins</b> ce que tu dépenses d'habitude d'ici la fin du mois (≈{' '}
                    <span className="whitespace-nowrap">{about(data.forecast.expenseAhead)}</span>)
                    {data.forecast.incomeAhead > 0 && (
                      <>
                        , <b className="text-slate-700">plus</b> ce que tu reçois d'habitude (≈ <span className="whitespace-nowrap">{about(data.forecast.incomeAhead)}</span>)
                      </>
                    )}
                    .
                  </p>
                  {data.forecast.billsOut > 0 && (
                    <p>
                      Tes factures prévues dans « À venir » sont comprises (<span className="whitespace-nowrap">{about(data.forecast.billsOut)}</span>).
                    </p>
                  )}
                  <p>Sur le graphique, les pointillés de couleur montrent tes {side === 'expense' ? 'dépenses' : 'revenus'} probables jusqu'à la fin du mois.</p>
                </div>
              )}
            </div>
          )}

          {/* Tableau pour les lecteurs d'écran (les valeurs ne dépendent pas du survol) */}
          <table className="sr-only">
            <caption>Cumul par jour</caption>
            <thead>
              <tr>
                <th>Jour</th>
                <th>Ce mois-ci</th>
                <th>Moyenne 3 mois</th>
              </tr>
            </thead>
            <tbody>
              {series.average.map((a, i) => (
                <tr key={i}>
                  <td>{dateLabel(i)}</td>
                  <td>{i < series.current.length ? money(series.current[i]) : '—'}</td>
                  <td>{money(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {hasGoals && (
        <button
          onClick={onOpenGoals}
          disabled={!onOpenGoals}
          className="mt-3 w-full rounded-2xl bg-emerald-500/10 px-3 py-2.5 text-xs text-left flex items-center gap-2 cursor-pointer disabled:cursor-default"
        >
          <Target className="w-4 h-4 text-emerald-600 shrink-0" />
          {goals.length > 0 ? (
            <span className="min-w-0 text-slate-700">
              Ce mois-ci, tu as avancé de <b className="text-emerald-700 tabular-nums">{Math.max(1, Math.round(goals[0].points))} %</b> vers {goals[0].wallet.name}{' '}
              <span className="tabular-nums">(+{formatMoney(goals[0].added, goals[0].wallet.currency, { ...getPrefs(), decimals: 'auto' })})</span>
              {goals.length > 1 && <span className="text-slate-500"> · +{goals.length - 1} autre{goals.length > 2 ? 's' : ''}</span>}
            </span>
          ) : (
            <span className="min-w-0 text-slate-700">Pas encore de dépôt dans tes objectifs ce mois-ci.</span>
          )}
          {onOpenGoals && <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-auto shrink-0" />}
        </button>
      )}
    </div>
  );
};
