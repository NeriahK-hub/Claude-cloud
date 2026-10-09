import React, { useMemo, useState } from 'react';
import { X, ChevronLeft, CalendarDays, Coins, Sofa, PiggyBank, Trophy } from 'lucide-react';
import { GoalChallenge, Settings, Transaction, Wallet } from '../types';
import { convertBetween, formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';
import { challengeTotal, niceAmount, weekendSaving } from '../lib/goals';
import { ymd } from '../lib/recurring';

// Défis d'épargne prêts à l'emploi : chacun crée un objectif complet (montant, date, rappels).

type Type = GoalChallenge['type'];

const DEFS: { type: Type; title: string; tag: string; text: string; Icon: typeof Trophy; icon: string; color: string }[] = [
  { type: '52w', title: '52 semaines', tag: 'Chaque semaine', text: 'Semaine 1\u00a0: 1\u00a0$, semaine 2\u00a0: 2\u00a0$, semaine 3\u00a0: 3\u00a0$… Au bout d\'un an, tu as 1\u00a0378\u00a0$.', Icon: CalendarDays, icon: 'CalendarDays', color: '#8B5CF6' },
  { type: 'daily', title: 'Un peu chaque jour', tag: 'Chaque jour', text: 'Tu mets la même petite somme de côté chaque jour. Par exemple 1\u00a0000\u00a0FC pendant 30\u00a0jours.', Icon: PiggyBank, icon: 'PiggyBank', color: '#F59E0B' },
  { type: 'weekend', title: 'Week-end sans dépense', tag: 'Le week-end', text: "Tu dépenses moins le week-end\u00a0: ce que tu ne dépenses pas est mis dans ton objectif.", Icon: Sofa, icon: 'Sofa', color: '#10B981' },
  { type: 'roundup', title: 'Petite monnaie', tag: 'Automatique', text: 'Chaque dépense est arrondie et la différence est mise de côté. Pour 4\u00a0300\u00a0FC, 700\u00a0FC partent dans ton objectif.', Icon: Coins, icon: 'Coins', color: '#EC4899' },
];

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export const ChallengeSheet: React.FC<{
  settings: Settings;
  wallets: Wallet[];
  transactions: Transaction[];
  onClose: () => void;
  onCreate: (w: Omit<Wallet, 'id' | 'archived'>) => void;
}> = ({ settings, wallets, transactions, onClose, onCreate }) => {
  const [type, setType] = useState<Type | null>(null);
  const currencies = [...new Set([settings.mainCurrency, settings.secondCurrency, 'USD', 'CDF'].filter(Boolean) as string[])];
  const [currency, setCurrency] = useState(settings.mainCurrency);
  const big = currency === 'CDF';
  const [base, setBase] = useState('');
  const [days, setDays] = useState(30);
  const [goal, setGoal] = useState('');
  const def = DEFS.find((d) => d.type === type);
  const value = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  const baseValue = value(base) || (type === '52w' ? (big ? 1000 : 1) : big ? 1000 : 1);
  const money = (v: number) => formatMoney(v, currency, { ...getPrefs(), decimals: 'auto' });

  // Montant proposé pour les défis sans règle fixe : d'après tes habitudes (8 week-ends / arrondis)
  const suggestion = useMemo(() => {
    const convert = (v: number, from: string, to: string) => convertBetween(v, from, to, settings);
    const fake: Wallet = { id: '', name: '', icon: '', color: '', currency, initialBalance: 0, includeInTotal: true, archived: false, kind: 'goal' };
    if (type === 'weekend') {
      const w = weekendSaving(fake, wallets, transactions, convert);
      return w && w.usual > 0 ? niceAmount(w.usual * 8 * 0.5) : big ? 50000 : 50; // la moitié d'habitude, sur 8 week-ends
    }
    if (type === 'roundup') return big ? 30000 : 30;
    return 0;
  }, [type, currency, wallets, transactions, settings, big]);

  const total = type === '52w' || type === 'daily' ? challengeTotal(type, baseValue, days) : value(goal) || suggestion;

  const start = () => {
    if (!def || !(total > 0)) return;
    const today = ymd(new Date());
    const ch: GoalChallenge = { type: def.type, start: today, ...(type === '52w' || type === 'daily' ? { base: baseValue } : {}), ...(type === 'daily' ? { days } : {}) };
    const length = type === '52w' ? 364 : type === 'daily' ? days - 1 : type === 'weekend' ? 55 : 91;
    onCreate({
      name: type === '52w' ? 'Défi 52 semaines' : type === 'daily' ? `Défi ${money(baseValue)} par jour` : type === 'weekend' ? 'Défi week-end' : 'Défi petite monnaie',
      icon: def.icon,
      color: def.color,
      currency,
      initialBalance: 0,
      includeInTotal: true,
      kind: 'goal',
      goalAmount: Math.round(total * 100) / 100,
      goalDate: addDays(length),
      challenge: ch,
      // 52 semaines : rappel chaque semaine le même jour (le montant suit la semaine)
      ...(type === '52w' ? { goalReminder: { day: new Date().getDay(), amount: baseValue } } : {}),
      ...(type === 'roundup' ? { roundUp: true } : {}),
    });
  };

  const chip = (on: boolean) => `h-9 px-3 rounded-xl text-[13px] font-semibold cursor-pointer transition ${on ? 'bg-accent' : 'bg-slate-100 text-slate-600'}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-[440px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {def && (
              <button onClick={() => setType(null)} aria-label="Autres défis" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-bold truncate">{def ? `Défi ${def.title.toLowerCase()}` : 'Commencer un défi'}</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!def ? (
          <div className="space-y-2">
            <p className="text-[13px] text-slate-500 mb-3 px-1 [text-wrap:pretty]">Choisis une façon d'épargner. Wallo crée l'objectif pour toi, tu peux tout changer ensuite.</p>
            {DEFS.map((d) => (
              <button key={d.type} onClick={() => setType(d.type)} className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-left cursor-pointer transition">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${d.color}22`, color: d.color }}>
                  <d.Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: d.color }}>{d.tag}</span>
                  <span className="block text-[15px] font-bold text-slate-900">{d.title}</span>
                  <span className="block text-[13px] text-slate-500 leading-snug mt-0.5 [text-wrap:pretty]">{d.text}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="text-[14px] text-slate-600 mb-4 [text-wrap:pretty]">{def.text}</p>

            <label className="block text-xs font-semibold text-slate-500 mb-1">Devise</label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {currencies.map((c) => (
                <button key={c} onClick={() => { setCurrency(c); setBase(''); setGoal(''); }} className={chip(currency === c)}>
                  {c}
                </button>
              ))}
            </div>

            {(type === '52w' || type === 'daily') && (
              <>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  {type === '52w' ? 'Montant de la 1re semaine (puis ×2, ×3…)' : 'Montant chaque jour'}
                </label>
                <input
                  inputMode="decimal"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  placeholder={String(big ? 1000 : 1)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-100 text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-accent mb-4"
                />
              </>
            )}
            {type === 'daily' && (
              <>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Pendant</label>
                <div className="flex gap-1.5 mb-4">
                  {[30, 60, 100].map((d) => (
                    <button key={d} onClick={() => setDays(d)} className={chip(days === d)}>
                      {d} jours
                    </button>
                  ))}
                </div>
              </>
            )}
            {(type === 'weekend' || type === 'roundup') && (
              <>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Objectif à atteindre</label>
                <input
                  inputMode="decimal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={String(suggestion)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-100 text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-accent mb-1"
                />
                <p className="text-[12px] text-slate-400 mb-4">
                  {type === 'weekend' ? 'Proposé d\'après tes dépenses des derniers week-ends, sur 8 semaines.' : 'Sur 3 mois. Les arrondis de tes autres objectifs s\'arrêtent.'}
                </p>
              </>
            )}

            <div className="rounded-2xl bg-violet-500/10 p-4 mb-4 flex items-center gap-3">
              <Trophy className="w-6 h-6 text-violet-600 shrink-0" />
              <p className="text-[14px] text-slate-700">
                Au bout du défi : <b className="text-[17px] tabular-nums text-slate-900">{money(total)}</b> épargnés
                {type === '52w' ? ' en 52 semaines' : type === 'daily' ? ` en ${days} jours` : type === 'weekend' ? ' en 8 semaines' : ' en 3 mois'}.
              </p>
            </div>

            <button onClick={start} disabled={!(total > 0)} className="w-full py-3.5 rounded-2xl bg-accent hover:bg-accent-hover disabled:opacity-40 font-bold text-sm cursor-pointer">
              Commencer le défi
            </button>
          </>
        )}
      </div>
    </div>
  );
};
