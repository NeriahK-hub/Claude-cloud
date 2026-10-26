import React, { useMemo } from 'react';
import { Check, Target, TrendingDown, Lightbulb } from 'lucide-react';
import { Recurring, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { usePersistentState } from '../hooks/usePersistentState';
import { formatMoney, mainToSecond } from '../lib/money';
import { getPrefs } from '../lib/display';
import { findSubscriptions } from '../lib/review';
import { incomeThisMonth, Kind, kindOf, Level, LEVELS, livingCost, needed, recurringPerMonth } from '../lib/livingCost';
import { IconBadge } from './AppIcon';
import { SecretMoney } from './MatrixSwap';

// « Pour vivre » (Rapport › Évolution) : combien gagner par mois pour vivre comme on veut.
// Trois niveaux au choix, calculés sur les vraies dépenses des 3 derniers mois.

interface Saved {
  level: Level;
  save: number; // % mis de côté (niveau Sérénité)
  kinds: Record<string, Kind>; // catégorie -> besoin / confort / ignorée
  goal: number; // objectif de revenu par mois (0 = aucun)
}
const DEFAULT: Saved = { level: 'comfort', save: 20, kinds: {}, goal: 0 };

const KIND_LABEL: Record<Kind, string> = { need: 'Besoin', comfort: 'Confort', skip: 'Ignorée' };
const NEXT_KIND: Record<Kind, Kind> = { need: 'comfort', comfort: 'skip', skip: 'need' };
const KIND_STYLE: Record<Kind, string> = {
  need: 'bg-sky-500/15 text-sky-600',
  comfort: 'bg-violet-500/15 text-violet-600',
  skip: 'bg-slate-500/15 text-slate-500',
};

export const LivingTool: React.FC<{ allTransactions: Transaction[]; categories: Category[]; settings: Settings; recurrings?: Recurring[] }> = ({ allTransactions, categories, settings, recurrings = [] }) => {
  const [saved, setSaved] = usePersistentState<Saved>('ap.living', DEFAULT);
  const main = settings.mainCurrency;
  const money = (v: number, cur = main) => formatMoney(Math.round(v), cur, { ...getPrefs(), decimals: 'never' });
  // Cases des niveaux : nombre court (« 1,16 M ») pour tenir dans la case, devise à part
  const short = (v: number) =>
    Math.abs(v) >= 1e6
      ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v / 1e6)} M`
      : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(v));
  const other = (v: number) => {
    const x = mainToSecond(v, settings);
    return x === null || !settings.secondCurrency ? null : `≈ ${money(x, settings.secondCurrency)}`;
  };

  const r = useMemo(() => livingCost(allTransactions, settings, categories, saved.kinds), [allTransactions, settings, categories, saved.kinds]);
  const subsTotal = useMemo(() => findSubscriptions(allTransactions, settings, categories, recurrings).reduce((s, x) => s + x.amount, 0), [allTransactions, settings, categories, recurrings]);
  const fixed = useMemo(() => recurringPerMonth(recurrings, settings), [recurrings, settings]);
  const thisMonth = useMemo(() => incomeThisMonth(allTransactions, settings), [allTransactions, settings]);

  if (!r.hasData) return <p className="text-center text-[14px] text-slate-500 py-10">Note quelques dépenses : il en faut sur les derniers mois pour faire le calcul.</p>;

  const level = saved.level;
  const need = needed(r, level, saved.save);
  const gap = need - r.income; // > 0 : il manque
  const ratio = need > 0 ? r.income / need : 0;
  const levelTitle = LEVELS.find((l) => l.id === level)!.title.toLowerCase();
  const topComfort = r.cats.find((c) => c.kind === 'comfort');
  const set = (p: Partial<Saved>) => setSaved({ ...saved, ...p });

  return (
    <div>
      <p className="text-[14px] text-slate-500 mb-3">Choisis comment tu veux vivre. Wallo calcule avec tes vraies dépenses ({r.months} dernier{r.months > 1 ? 's' : ''} mois).</p>

      {/* Les trois niveaux */}
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Niveau de vie">
        {LEVELS.map((l) => {
          const v = needed(r, l.id, saved.save);
          const on = level === l.id;
          return (
            <button
              key={l.id}
              role="radio"
              aria-checked={on}
              onClick={() => set({ level: l.id })}
              className={`rounded-2xl px-2 py-3 text-center cursor-pointer transition active:scale-[0.97] ${on ? 'is-selected' : 'bg-slate-100'}`}
            >
              <span className="block text-[12.5px] font-semibold text-slate-500">{l.title}</span>
              <span className="block text-[17px] font-bold tabular-nums text-slate-900 mt-1 whitespace-nowrap"><SecretMoney text={short(v)} /></span>
              <span className="block text-[11px] font-medium text-slate-400 leading-tight">{main} / mois</span>
              <span className="block text-[10.5px] text-slate-500 mt-1.5 leading-tight">{l.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Le résultat : carte calme, le montant en grand, puis où tu en es */}
      <div className="mt-3 rounded-3xl bg-white border border-slate-100 p-5">
        <p className="text-[13px] font-medium text-slate-500">Pour vivre {level === 'essential' ? 'avec l’essentiel' : level === 'comfort' ? 'à l’aise' : 'en sérénité'}, il te faut</p>
        <p className={`${money(need).length > 13 ? 'text-[26px]' : 'text-[30px]'} font-bold tracking-tight tabular-nums leading-tight mt-1 whitespace-nowrap text-slate-900`}>
          <SecretMoney text={money(need)} />
        </p>
        <p className="text-[12.5px] text-slate-400 tabular-nums">par mois{other(need) ? ` · ${other(need)}` : ''}</p>
        {r.income > 0 ? (
          <>
            <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${ratio >= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] text-slate-500">
                Tu gagnes ≈ <b className="text-slate-800 tabular-nums whitespace-nowrap">{money(r.income)}</b> / mois
              </span>
              <span
                className={`inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-semibold tabular-nums whitespace-nowrap ${gap > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}
              >
                {gap > 0 ? `Il manque ${money(gap)}` : `+${money(-gap)} de marge`}
              </span>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-slate-500 mt-3">Note tes revenus pour voir où tu en es.</p>
        )}
      </div>

      {/* Épargne (niveau Sérénité) */}
      {level === 'serene' && (
        <div className="mt-3 rounded-2xl bg-slate-100 px-4 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] font-semibold text-slate-700">Mettre de côté</span>
            <span className="text-[24px] font-extrabold tabular-nums text-slate-900">{saved.save} %</span>
          </div>
          <input type="range" min={5} max={40} step={5} value={saved.save} onChange={(e) => set({ save: Number(e.target.value) })} aria-label="Part mise de côté" className="slider mt-1" style={{ ['--fill' as string]: `${((saved.save - 5) / 35) * 100}%` }} />
          <p className="text-[12px] text-slate-500">Soit ≈ <b className="text-slate-700 whitespace-nowrap">{money(need * (saved.save / 100))}</b> épargnés chaque mois.</p>
        </div>
      )}

      {/* Conseils */}
      <div className="mt-3 space-y-2">
        {fixed > 0 && r.income > 0 && (
          <Tip Icon={Lightbulb}>
            Ce qui revient chaque mois (À venir) prend <b>{Math.round((fixed / r.income) * 100)} %</b> de tes revenus : {money(fixed)}.
          </Tip>
        )}
        {subsTotal > 0 && (
          <Tip Icon={TrendingDown}>
            Tes abonnements repérés coûtent <b>{money(subsTotal)}</b> par mois. Vérifie que tu en as encore besoin.
          </Tip>
        )}
        {topComfort && topComfort.month > 0 && level !== 'essential' && (
          <Tip Icon={Lightbulb}>
            Ton plus gros confort : <b>{topComfort.name}</b>, {money(topComfort.month)} par mois. Le baisser de 20 % réduirait ce qu’il te faut de ≈ {money(topComfort.month * 0.2 * 1.1)}.
          </Tip>
        )}
      </div>

      {/* Objectif de revenu */}
      <div className="mt-3 rounded-2xl bg-slate-100 px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-slate-500" />
          <span className="text-[14px] font-semibold text-slate-700">Mon objectif de revenu</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={saved.goal ? String(saved.goal) : ''}
            onChange={(e) => set({ goal: Number(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0 })}
            placeholder={String(Math.round(need / 10) * 10)}
            aria-label="Objectif de revenu par mois"
            className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-white text-[16px] font-semibold tabular-nums outline-none focus:ring-2 focus:ring-accent field-plain"
          />
          <span className="text-[13px] font-semibold text-slate-500">{main} / mois</span>
          <button onClick={() => set({ goal: Math.round(need / 10) * 10 })} className="h-11 px-3 rounded-xl bg-white text-[13px] font-bold cursor-pointer active:scale-95 transition">
            Prendre {levelTitle}
          </button>
        </div>
        {saved.goal > 0 && (
          <>
            <div className="mt-3 h-2.5 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full bg-accent-deep" style={{ width: `${Math.min(100, (thisMonth / saved.goal) * 100)}%` }} />
            </div>
            <p className="text-[13px] text-slate-600 mt-2">
              Ce mois-ci : <b className="whitespace-nowrap">{money(thisMonth)}</b> sur <b className="whitespace-nowrap">{money(saved.goal)}</b> ({Math.round((thisMonth / saved.goal) * 100)} %).
            </p>
          </>
        )}
      </div>

      {/* D'où ça vient : on peut corriger */}
      <h3 className="text-[12px] font-bold text-slate-400 tracking-wider uppercase mt-5 mb-2 px-1">D’où vient le calcul</h3>
      <p className="text-[12px] text-slate-500 px-1 mb-2">Touche l’étiquette d’une catégorie pour la changer : besoin, confort, ou ignorée.</p>
      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
        {r.cats.map((c) => {
          const kind = kindOf(c.id, saved.kinds);
          return (
            <div key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <IconBadge icon={c.icon} image={c.image} color={c.color} size="sm" />
              <span className="flex-1 min-w-0 text-[14px] font-semibold text-slate-900 truncate">{c.name}</span>
              <span className="text-[13px] font-semibold tabular-nums text-slate-600 whitespace-nowrap"><SecretMoney text={money(c.month)} /></span>
              <button
                onClick={() => set({ kinds: { ...saved.kinds, [c.id]: NEXT_KIND[kind] } })}
                aria-label={`${c.name} : ${KIND_LABEL[kind]}. Changer`}
                className={`shrink-0 h-7 px-2.5 rounded-full text-[11.5px] font-bold cursor-pointer active:scale-95 transition ${KIND_STYLE[kind]}`}
              >
                {KIND_LABEL[kind]}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[13px] px-1 mt-2 text-slate-500">
        <span>Besoins <b className="text-slate-700 whitespace-nowrap">{money(r.needs)}</b></span>
        <span>Confort <b className="text-slate-700 whitespace-nowrap">{money(r.comfort)}</b></span>
      </div>
    </div>
  );
};

const Tip: React.FC<{ Icon: typeof Check; children: React.ReactNode }> = ({ Icon, children }) => (
  <div className="flex items-start gap-2.5 rounded-2xl bg-slate-100 px-3.5 py-3">
    <Icon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
    <p className="text-[13px] leading-snug text-slate-600">{children}</p>
  </div>
);
