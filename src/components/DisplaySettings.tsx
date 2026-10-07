import React, { useState } from 'react';
import { ChevronRight, X, Check } from 'lucide-react';
import { DisplayPrefs, formatDate, setPrefs, useDisplayPrefs } from '../lib/display';
import { formatMoney } from '../lib/money';
import { haptic } from '../lib/haptics';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const WEEKDAYS: Record<number, string> = { 1: 'Lundi', 0: 'Dimanche', 6: 'Samedi' };

interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

// Paramètres › Affichage : une ligne par réglage (valeur à droite), on touche pour choisir
export const DisplaySettings: React.FC<{ currency: string }> = ({ currency }) => {
  const prefs = useDisplayPrefs();
  const [open, setOpen] = useState<keyof DisplayPrefs | null>(null);
  const today = new Date();

  // Exemple de montant tel qu'il s'afficherait avec un réglage donné
  const sample = (changes: Partial<DisplayPrefs>, v = 1234.5) => formatMoney(v, currency, { ...prefs, ...changes });
  const sampleDate = (date: DisplayPrefs['date']) => formatDate(today, false, date);

  const rows: { key: keyof DisplayPrefs; label: string; value: string; choices: Choice<DisplayPrefs[keyof DisplayPrefs]>[]; grid?: boolean }[] = [
    {
      key: 'number',
      label: 'Format des montants',
      value: sample({}),
      choices: (['fr', 'en', 'de', 'ch'] as const).map((n) => ({ value: n, label: sample({ number: n }) })),
    },
    {
      key: 'decimals',
      label: 'Centimes',
      value: { always: 'Toujours', auto: 'Si nécessaire', never: 'Jamais' }[prefs.decimals],
      choices: [
        { value: 'always', label: 'Toujours', hint: sample({ decimals: 'always' }, 150000) },
        { value: 'auto', label: 'Seulement si nécessaire', hint: `${sample({ decimals: 'auto' }, 150000)} · ${sample({ decimals: 'auto' }, 12.5)}` },
        { value: 'never', label: 'Jamais', hint: sample({ decimals: 'never' }, 12.5) },
      ],
    },
    {
      key: 'date',
      label: 'Format de la date',
      value: formatDate(today),
      choices: (['dmy', 'mdy', 'ymd'] as const).map((d) => ({ value: d, label: sampleDate(d) })),
    },
    {
      key: 'weekStart',
      label: 'Premier jour de la semaine',
      value: WEEKDAYS[prefs.weekStart],
      choices: ([1, 0, 6] as const).map((d) => ({ value: d, label: WEEKDAYS[d] })),
    },
    {
      key: 'monthStart',
      label: 'Premier jour du mois',
      value: prefs.monthStart === 1 ? '1er' : `Le ${prefs.monthStart}`,
      grid: true,
      choices: Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: i === 0 ? '1er' : String(i + 1) })),
    },
    {
      key: 'yearStart',
      label: "Premier mois de l'année",
      value: MONTHS[prefs.yearStart],
      grid: true,
      choices: MONTHS.map((m, i) => ({ value: i, label: m })),
    },
  ];
  const current = rows.find((r) => r.key === open);

  return (
    <>
      <div className="divide-y divide-slate-100 -mx-1">
        {rows.map((r) => (
          <button
            key={r.key}
            onClick={() => setOpen(r.key)}
            className="w-full flex items-center justify-between gap-3 px-1 py-3 text-left cursor-pointer"
          >
            <span className="text-sm text-slate-800 min-w-0">{r.label}</span>
            <span className="flex items-center gap-1 shrink-0 max-w-[55%]">
              <span className="text-sm font-semibold text-emerald-600 truncate tabular-nums">{r.value}</span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </span>
          </button>
        ))}
        <label className="flex items-center justify-between gap-3 px-1 py-3 cursor-pointer">
          <span>
            <span className="block text-sm text-slate-800">Option « Exclure du rapport »</span>
            <span className="block text-xs text-slate-400">Un interrupteur dans l'ajout et la modification d'une opération.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={prefs.excludeOption}
            onChange={(e) => {
              haptic();
              setPrefs({ excludeOption: e.target.checked });
            }}
            className="toggle shrink-0"
          />
        </label>
        <label className="flex items-center justify-between gap-3 px-1 py-3 cursor-pointer">
          <span>
            <span className="block text-sm text-slate-800">Carte du portefeuille sur l'accueil</span>
            <span className="block text-xs text-slate-400">Progression d'un objectif, limite d'un crédit ou membres d'un partage, sous les boutons.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={prefs.homeWalletCard}
            onChange={(e) => {
              haptic();
              setPrefs({ homeWalletCard: e.target.checked });
            }}
            className="toggle shrink-0"
          />
        </label>
      </div>
      {prefs.monthStart !== 1 && (
        <p className="text-xs text-slate-500 mt-1">
          Tes mois vont du {prefs.monthStart} au {prefs.monthStart - 1} du mois suivant : rapport, budgets et historique suivent ce découpage.
        </p>
      )}

      {current && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={() => setOpen(null)}>
          <div
            className="w-full sm:max-w-[420px] max-h-[85dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold">{current.label}</h2>
              <button onClick={() => setOpen(null)} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={current.grid ? `grid ${current.key === 'monthStart' ? 'grid-cols-7' : 'grid-cols-3'} gap-1.5` : 'space-y-1'}>
              {current.choices.map((c) => {
                const on = prefs[current.key] === c.value;
                return (
                  <button
                    key={String(c.value)}
                    onClick={() => {
                      haptic();
                      setPrefs({ [current.key]: c.value } as Partial<DisplayPrefs>);
                      setOpen(null);
                    }}
                    aria-pressed={on}
                    className={
                      current.grid
                        ? `py-2.5 rounded-xl text-sm font-semibold cursor-pointer ${on ? 'bg-accent text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`
                        : `w-full flex items-center justify-between gap-3 px-3 py-3 rounded-2xl text-left cursor-pointer ${on ? 'bg-slate-100' : 'hover:bg-slate-50'}`
                    }
                  >
                    {current.grid ? (
                      c.label
                    ) : (
                      <>
                        <span>
                          <span className="block text-sm font-semibold text-slate-900 tabular-nums">{c.label}</span>
                          {c.hint && <span className="block text-xs text-slate-500 tabular-nums">{c.hint}</span>}
                        </span>
                        {on && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
