import React, { useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Sparkles, ChevronRight } from 'lucide-react';
import { Settings, Transaction } from '../types';
import { countsInStats, formatMoney, toMain } from '../lib/money';
import { monthRange } from '../lib/budgets';
import { getPrefs, setPrefs, useDisplayPrefs } from '../lib/display';
import { haptic } from '../lib/haptics';

// Mode simple (Paramètres › Apparence › Interface) : l'accueil réduit à l'essentiel,
// pour les personnes peu à l'aise avec le téléphone. Deux gros boutons, deux chiffres, c'est tout.

// Les deux gros boutons : « J'ai dépensé » et « J'ai reçu »
export const SimpleActions: React.FC<{ onExpense: () => void; onIncome: () => void }> = ({ onExpense, onIncome }) => {
  const { iconsOnly } = useDisplayPrefs();
  return (
  <div className="grid grid-cols-2 gap-3" data-coach="simple-actions">
    {[
      { label: 'J’ai dépensé', hint: 'Argent qui sort', Icon: ArrowUpRight, color: '#EF4444', onClick: onExpense },
      { label: 'J’ai reçu', hint: 'Argent qui entre', Icon: ArrowDownLeft, color: '#10B981', onClick: onIncome },
    ].map(({ label, hint, Icon, color, onClick }) => (
      <button
        key={label}
        onClick={onClick}
        aria-label={label}
        className={`relative overflow-hidden rounded-[28px] bg-white border border-slate-100 p-4 pt-5 flex flex-col gap-3 cursor-pointer active:scale-[0.97] transition shadow-xs ${iconsOnly ? 'items-center justify-center min-h-[140px]' : 'items-start text-left'}`}
      >
        <span className={`${iconsOnly ? 'w-20 h-20 rounded-3xl' : 'w-14 h-14 rounded-2xl'} flex items-center justify-center`} style={{ background: color }}>
          <Icon className={iconsOnly ? 'w-11 h-11 text-white' : 'w-8 h-8 text-white'} strokeWidth={2.6} />
        </span>
        {!iconsOnly && (
          <span>
            <span className="block text-[19px] font-bold text-slate-900 leading-tight">{label}</span>
            <span className="block text-[13px] text-slate-500 mt-0.5">{hint}</span>
          </span>
        )}
        {/* Halo de la couleur dans le coin */}
        <span className="absolute -right-8 -top-8 w-24 h-24 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${color}26 0%, ${color}00 70%)` }} />
      </button>
    ))}
  </div>
  );
};

// Ce mois-ci, en deux chiffres et en mots simples
export const SimpleMonth: React.FC<{ transactions: Transaction[]; settings: Settings; hidden: boolean }> = ({ transactions, settings, hidden }) => {
  const { inc, out } = useMemo(() => {
    const r = monthRange();
    let inc = 0;
    let out = 0;
    for (const t of transactions) {
      const d = new Date(t.createdAt);
      if ((r.start && d < r.start) || (r.end && d > r.end) || !countsInStats(t)) continue;
      const v = toMain(t.amount, t.currency, settings);
      if (v > 0) inc += v;
      else out -= v;
    }
    return { inc, out };
  }, [transactions, settings]);
  const money = (v: number) => (hidden ? '••••••' : formatMoney(Math.round(v), settings.mainCurrency, { ...getPrefs(), decimals: 'never' }));
  const left = inc - out;
  return (
    <div className="rounded-[28px] bg-white border border-slate-100 p-4">
      <div className="text-[15px] font-bold text-slate-900 mb-3">Ce mois-ci</div>
      <div className="space-y-2.5">
        {[
          { label: 'Tu as reçu', value: inc, color: '#10B981', Icon: ArrowDownLeft },
          { label: 'Tu as dépensé', value: out, color: '#EF4444', Icon: ArrowUpRight },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}1f`, color }}>
              <Icon className="w-5 h-5" strokeWidth={2.4} />
            </span>
            <span className="flex-1 min-w-0 text-[16px] text-slate-600">{label}</span>
            <span className="text-[18px] font-bold tabular-nums whitespace-nowrap" style={{ color }}>
              {money(value)}
            </span>
          </div>
        ))}
      </div>
      {(inc > 0 || out > 0) && !hidden && (
        <p className={`mt-3 pt-3 border-t border-slate-100 text-[15px] font-semibold leading-snug ${left >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {left >= 0
            ? `Bravo : il te reste ${formatMoney(Math.round(left), settings.mainCurrency, { ...getPrefs(), decimals: 'never' })} de ce que tu as reçu.`
            : `Attention : tu as dépensé ${formatMoney(Math.round(-left), settings.mainCurrency, { ...getPrefs(), decimals: 'never' })} de plus que ce que tu as reçu.`}
        </p>
      )}
    </div>
  );
};

// Lien en bas de l'accueil simple : revenir au mode complet en un geste
export const SimpleModeFooter: React.FC = () => (
  <button
    onClick={() => {
      haptic('success');
      setPrefs({ simpleMode: false });
    }}
    className="mx-auto mt-2 mb-4 flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-100 text-[13px] font-semibold text-slate-600 cursor-pointer active:scale-95 transition"
  >
    <Sparkles className="w-4 h-4 text-violet-500" />
    Mode simple · Voir toute l&rsquo;app
    <ChevronRight className="w-4 h-4 text-slate-400" />
  </button>
);
