import React, { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { periodBalances, reportScope } from '../lib/report';
import { formatMoney } from '../lib/money';
import { getPrefs, useDisplayPrefs } from '../lib/display';
import { topOf } from '../lib/insights';
import { isSpending } from '../lib/review';
import { toMain } from '../lib/money';
import { IconBadge } from './AppIcon';
import { Amount } from './MoneyText';
import { HIDDEN_AMOUNT } from './MatrixSwap';

const money = (v: number, cur: string) => formatMoney(Math.round(v), cur, { ...getPrefs(), decimals: 'never' });

// ---------- Évolution du solde sur 12 mois ----------
// Le solde à la fin de chaque mois (portefeuilles du total, devise principale).
export const BalanceCurveTool: React.FC<{ wallets: Wallet[]; allTransactions: Transaction[]; settings: Settings }> = ({ wallets, allTransactions, settings }) => {
  const { hideBalance } = useDisplayPrefs();
  const main = settings.mainCurrency;
  const points = useMemo(() => {
    const scope = reportScope(wallets, null);
    return Array.from({ length: 12 }, (_, k) => {
      const offset = k - 11;
      const closing = periodBalances(allTransactions, scope, { kind: 'month', offset }, settings).closing;
      const d = new Date();
      d.setMonth(d.getMonth() + offset, 1);
      return { value: closing, label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''), long: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) };
    });
  }, [wallets, allTransactions, settings]);
  const [pick, setPick] = useState(11);

  const W = 320;
  const H = 150;
  const PAD = { l: 8, r: 8, t: 14, b: 8 };
  const min = Math.min(...points.map((p) => p.value), 0);
  const max = Math.max(...points.map((p) => p.value), 1);
  const span = max - min || 1;
  const x = (i: number) => PAD.l + (i / 11) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(11).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;
  const cur = points[pick];
  const prev = pick > 0 ? points[pick - 1] : null;
  const diff = prev ? cur.value - prev.value : null;
  const first = points[0];
  const last = points[11];
  const show = (v: number) => (hideBalance ? HIDDEN_AMOUNT : money(v, main));

  const read = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const rel = ((clientX - r.left) / r.width) * W;
    setPick(Math.max(0, Math.min(11, Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * 11))));
  };

  return (
    <div className="chart-bal">
      <p className="text-[13px] font-medium text-slate-500 capitalize">{cur.long}</p>
      <div className="text-[28px] font-extrabold tabular-nums tracking-tight text-slate-900 leading-tight">{show(cur.value)}</div>
      {diff !== null && (
        <div className={`flex items-center gap-1 text-[13px] font-semibold ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {diff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {hideBalance ? HIDDEN_AMOUNT : `${diff >= 0 ? '+' : '−'}${money(Math.abs(diff), main)}`} <span className="font-medium text-slate-400">sur le mois</span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Solde à la fin de chacun des 12 derniers mois"
        tabIndex={0}
        className="block w-full mt-3 outline-none touch-pan-y"
        onPointerMove={(e) => read(e.clientX, e.currentTarget)}
        onPointerDown={(e) => read(e.clientX, e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPick((p) => Math.max(0, p - 1));
          else if (e.key === 'ArrowRight') setPick((p) => Math.min(11, p + 1));
          else return;
          e.preventDefault();
        }}
      >
        {min < 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="stroke-slate-200" strokeDasharray="3 3" strokeWidth={1} />}
        <path d={area} className="chart-area" />
        <path d={line} fill="none" className="chart-series" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(pick)} x2={x(pick)} y1={PAD.t} y2={H - PAD.b} className="stroke-slate-300" strokeWidth={1} />
        <circle cx={x(pick)} cy={y(cur.value)} r={4.5} className="chart-dot" strokeWidth={2} />
      </svg>
      <div className="flex justify-between mt-1 px-1">
        {points.map((p, i) => (
          <span key={i} className={`w-0 flex justify-center text-[10px] capitalize ${i === pick ? 'font-bold text-slate-900' : 'text-slate-400'} ${i % 2 ? 'invisible' : ''}`}>
            <span className="shrink-0">{p.label}</span>
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-[14px] text-slate-700 leading-snug">
        Il y a 11 mois : <b className="text-slate-900 whitespace-nowrap">{show(first.value)}</b>. Aujourd'hui : <b className="text-slate-900 whitespace-nowrap">{show(last.value)}</b>
        {!hideBalance && (
          <>
            {' '}
            (<b className={last.value - first.value >= 0 ? 'text-emerald-600' : 'text-red-500'}>
              {last.value - first.value >= 0 ? '+' : '−'}
              {money(Math.abs(last.value - first.value), main)}
            </b>
            ).
          </>
        )}
      </div>
      <p className="text-[12px] text-slate-400 mt-2 px-1">Touche ou glisse sur la courbe pour voir un autre mois. Seuls les portefeuilles comptés dans ton total sont pris en compte.</p>
    </div>
  );
};

// ---------- « Et si je dépensais moins ? » ----------
// On choisit une catégorie (ou tout) et un pourcentage : Wallo dit ce que ça ferait garder par mois, par an, en 5 ans.
export const WhatIfTool: React.FC<{ allTransactions: Transaction[]; categories: Category[]; settings: Settings }> = ({ allTransactions, categories, settings }) => {
  const main = settings.mainCurrency;
  const [pct, setPct] = useState(10);
  const [catId, setCatId] = useState('all');

  // Moyenne par mois sur les 3 derniers mois, par catégorie principale
  const data = useMemo(() => {
    const from = Date.now() - 90 * 86400000;
    const map = new Map<string, { id: string; name: string; color: string; icon: string; image?: string; amount: number }>();
    let total = 0;
    for (const t of allTransactions) {
      if (!isSpending(t) || new Date(t.createdAt).getTime() < from) continue;
      const v = -toMain(t.amount, t.currency, settings);
      const c = topOf(t, categories);
      const cur = map.get(c.id) ?? { ...c, amount: 0 };
      cur.amount += v;
      map.set(c.id, cur);
      total += v;
    }
    const list = [...map.values()].map((c) => ({ ...c, month: c.amount / 3 })).sort((a, b) => b.month - a.month);
    return { list: list.slice(0, 6), total: total / 3 };
  }, [allTransactions, categories, settings]);

  if (data.total <= 0) return <p className="text-center text-[14px] text-slate-500 py-10">Note quelques dépenses : il en faut sur les 3 derniers mois pour faire le calcul.</p>;

  const base = catId === 'all' ? data.total : data.list.find((c) => c.id === catId)?.month ?? 0;
  const saved = base * (pct / 100);
  const name = catId === 'all' ? 'tes dépenses' : data.list.find((c) => c.id === catId)?.name ?? '';

  return (
    <div>
      <p className="text-[14px] text-slate-500 mb-3">Choisis où tu veux dépenser moins.</p>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        <button onClick={() => setCatId('all')} aria-pressed={catId === 'all'} className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer transition ${catId === 'all' ? 'is-selected' : 'bg-slate-100 text-slate-600'}`}>
          Tout
        </button>
        {data.list.map((c) => (
          <button key={c.id} onClick={() => setCatId(c.id)} aria-pressed={catId === c.id} className={`shrink-0 h-9 pl-1.5 pr-3.5 rounded-full flex items-center gap-1.5 text-[13px] font-semibold cursor-pointer transition ${catId === c.id ? 'is-selected' : 'bg-slate-100 text-slate-600'}`}>
            <IconBadge icon={c.icon} image={c.image} color={c.color} size="xs" />
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-slate-100 px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] font-semibold text-slate-700">Dépenser moins de</span>
          <span className="text-[28px] font-extrabold tabular-nums text-slate-900">{pct} %</span>
        </div>
        <input
          type="range"
          min={5}
          max={50}
          step={5}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          aria-label="Pourcentage de dépenses en moins"
          className="slider mt-1"
          style={{ ['--fill' as string]: `${((pct - 5) / 45) * 100}%` }}
        />
        <div className="flex justify-between text-[11px] text-slate-400 mt-0.5">
          <span>5 %</span>
          <span>50 %</span>
        </div>
        <p className="text-[13px] text-slate-500 mt-2">
          Aujourd'hui tu dépenses ≈ <b className="text-slate-700 whitespace-nowrap">{money(base, main)}</b> par mois pour {name}.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-slate-100 px-3 py-3 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500">Chaque mois</span>
          <Amount text={money(saved, main)} size="lg" tone="#059669" prefix="+" />
        </div>
        <div className="rounded-2xl bg-slate-100 px-3 py-3 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500">En un an</span>
          <Amount text={money(saved * 12, main)} size="lg" tone="#059669" prefix="+" />
        </div>
      </div>
      <div className="mt-2 relative overflow-hidden rounded-[28px] p-5 text-center" style={{ background: 'linear-gradient(135deg, #10B981, #0EA5E9)' }}>
        <div className="text-[13px] font-semibold" style={{ color: 'rgb(255 255 255 / 0.85)' }}>
          En 5 ans, tu garderais
        </div>
        <div className="text-[32px] font-extrabold tabular-nums leading-tight whitespace-nowrap" style={{ color: '#fff' }}>
          ≈ {money(saved * 60, main)}
        </div>
      </div>
    </div>
  );
};
