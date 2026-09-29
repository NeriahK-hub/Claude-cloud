import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Settings, Transaction, Wallet } from '../types';
import { countsInStats, formatMoney, toMain } from '../lib/money';

interface MonthReportCardProps {
  allTransactions: Transaction[];
  wallets: Wallet[];
  activeWallet: Wallet | null; // null = portefeuilles comptés dans le total
  settings: Settings;
  onOpenReports: () => void;
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
export const MonthReportCard: React.FC<MonthReportCardProps> = ({ allTransactions, wallets, activeWallet, settings, onOpenReports }) => {
  const [side, setSide] = useState<Side>('expense');
  const [hover, setHover] = useState<number | null>(null); // jour survolé (index 0 = le 1er)
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const main = settings.mainCurrency;

  const data = useMemo(() => {
    const scope = activeWallet ? [activeWallet] : wallets.filter((w) => w.includeInTotal && !w.archived);
    const ids = new Set(scope.map((w) => w.id));
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const daysIn = (yy: number, mm: number) => new Date(yy, mm + 1, 0).getDate();
    const days = daysIn(y, m);
    const today = now.getDate();

    // Montant par jour du mois, pour un mois donné (décalage 0 = ce mois-ci)
    const perDay = (offset: number, s: Side) => {
      const d0 = new Date(y, m + offset, 1);
      const n = daysIn(d0.getFullYear(), d0.getMonth());
      const arr = new Array<number>(n).fill(0);
      for (const t of allTransactions) {
        if (!ids.has(t.walletId) || !countsInStats(t) || (s === 'expense' ? t.amount >= 0 : t.amount <= 0)) continue;
        const d = new Date(t.createdAt);
        if (d.getFullYear() !== d0.getFullYear() || d.getMonth() !== d0.getMonth()) continue;
        arr[d.getDate() - 1] += Math.abs(toMain(t.amount, t.currency, settings));
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
    return { days, today, y, m, expense: build('expense'), income: build('income') };
  }, [allTransactions, wallets, activeWallet, settings]);

  const series = data[side];
  const hasData = series.total > 0 || series.average.some((v) => v > 0);
  const day = hover ?? data.today - 1;
  const cur = day < series.current.length ? series.current[day] : null;
  const avg = series.average[day] ?? 0;
  const money = (v: number) => formatMoney(v, main);
  const dateLabel = (i: number) => `${String(i + 1).padStart(2, '0')}/${String(data.m + 1).padStart(2, '0')}`;

  // Écart avec la moyenne à la même date (aujourd'hui)
  const avgToday = series.average[data.today - 1] ?? 0;
  const diff = avgToday > 0 ? (series.total - avgToday) / avgToday : null;

  // Géométrie
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const max = Math.max(1, ...series.current, ...series.average);
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
    setHover(Math.max(0, Math.min(data.days - 1, Math.round(rel * (data.days - 1)))));
  };

  const tab = (s: Side, label: string, value: number) => (
    <button
      onClick={() => setSide(s)}
      aria-pressed={side === s}
      className={`flex-1 pb-2 text-center cursor-pointer border-b-2 transition-colors ${side === s ? 'chart-underline' : 'border-slate-100'}`}
    >
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`text-base font-bold ${side === s ? 'text-slate-900' : 'text-slate-500'}`}>{money(value)}</div>
    </button>
  );

  return (
    <div className={`bg-white rounded-3xl border border-slate-100 p-4 ${side === 'expense' ? 'chart-exp' : 'chart-inc'}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">Rapport de ce mois</h2>
        <button onClick={onOpenReports} className="flex items-center gap-0.5 text-xs font-bold text-emerald-700 cursor-pointer">
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
          <div className="rounded-2xl bg-slate-100 px-3 py-2 mb-2 text-xs" aria-live="polite">
            <div className="font-semibold text-slate-500 mb-0.5">
              {day === data.today - 1 ? `Aujourd'hui, ${dateLabel(day)}` : dateLabel(day)}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 rounded-full chart-key-series shrink-0" />
              <span className="font-bold text-slate-900 tabular-nums">{cur === null ? '—' : money(cur)}</span>
              <span className="text-slate-500">ce mois-ci</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 rounded-full chart-key-ref shrink-0" />
              <span className="font-bold text-slate-900 tabular-nums">{money(avg)}</span>
              <span className="text-slate-500">moyenne des 3 mois précédents</span>
            </div>
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
                onPointerMove={(e) => pickDay(e.clientX, e.currentTarget)}
                onPointerDown={(e) => pickDay(e.clientX, e.currentTarget)}
                onPointerLeave={() => setHover(null)}
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
                    <text x={width - 2} y={yv(t) + 4} textAnchor="end" className="fill-slate-400 text-[10px] tabular-nums">
                      {compact(t)}
                    </text>
                  </g>
                ))}
                <text x={PAD.left} y={H - 4} className="fill-slate-400 text-[10px]">{dateLabel(0)}</text>
                <text x={PAD.left + plotW} y={H - 4} textAnchor="end" className="fill-slate-400 text-[10px]">{dateLabel(data.days - 1)}</text>

                {/* Moyenne (référence grise) puis ce mois-ci (couleur + voile léger) */}
                <path d={path(series.average)} fill="none" className="chart-ref" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {area && <path d={area} className="chart-area" />}
                <path d={path(series.current)} fill="none" className="chart-series" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

                {/* Repère du jour lu */}
                <line x1={x(day)} x2={x(day)} y1={PAD.top} y2={yv(0)} className="stroke-slate-300" strokeWidth={1} />
                {cur !== null && <circle cx={x(day)} cy={yv(cur)} r={4.5} className="chart-dot" strokeWidth={2} />}
              </svg>
            )}
          </div>

          {/* Légende (deux séries -> toujours présente) */}
          <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full chart-key-series" /> Ce mois-ci
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full chart-key-ref" /> Moyenne 3 mois
            </span>
          </div>

          {diff !== null && Math.abs(diff) >= 0.01 && (
            <p className="text-xs text-slate-600 mt-2">
              À cette date, tu as {side === 'expense' ? 'dépensé' : 'gagné'}{' '}
              <b>
                {Math.round(Math.abs(diff) * 100)} % de {diff > 0 ? 'plus' : 'moins'}
              </b>{' '}
              que d'habitude.
            </p>
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
    </div>
  );
};
