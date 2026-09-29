import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { Period, PeriodKind, PERIOD_KINDS, periodLabel } from '../lib/periods';
import { haptic } from '../lib/haptics';

// Onglets de périodes (les plus récentes à droite, glisser vers la gauche pour remonter le temps)
// + bouton calendrier pour choisir l'intervalle : jour, semaine, mois…
export const PeriodBar: React.FC<{ value: Period; onChange: (p: Period) => void }> = ({ value, onChange }) => {
  const [picking, setPicking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const kindLabel = PERIOD_KINDS.find((k) => k.id === value.kind)?.label;
  const hasTabs = value.kind !== 'all' && value.kind !== 'custom';
  const offsets = Array.from({ length: 12 }, (_, i) => i - 11); // -11 … 0

  // Toujours afficher la période en cours (à droite) quand on change d'intervalle
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [value.kind]);

  return (
    <>
      <div className="flex items-stretch gap-2 border-b border-slate-200">
        <button
          onClick={() => setPicking(true)}
          aria-label="Choisir l'intervalle de temps"
          className="shrink-0 mb-1.5 flex items-center gap-1.5 pl-2.5 pr-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
        >
          <CalendarDays className="w-4 h-4" /> {kindLabel}
        </button>
        {hasTabs ? (
          <div ref={scroller} className="flex-1 min-w-0 flex overflow-x-auto no-scrollbar">
            {offsets.map((o) => {
              const active = value.offset === o;
              return (
                <button
                  key={o}
                  onClick={() => { haptic(); onChange({ kind: value.kind, offset: o }); }}
                  className={`shrink-0 px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wide border-b-2 -mb-px cursor-pointer transition ${
                    active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {periodLabel({ kind: value.kind, offset: o })}
                </button>
              );
            })}
          </div>
        ) : (
          <button
            onClick={() => value.kind === 'custom' && setPicking(true)}
            className="flex-1 text-left px-2 pb-2 pt-1 text-xs font-bold uppercase tracking-wide text-slate-900 border-b-2 border-slate-900 -mb-px cursor-pointer"
          >
            {periodLabel(value)}
          </button>
        )}
      </div>

      {picking && (
        <PeriodSheet
          value={value}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            onChange(p);
            setPicking(false);
          }}
        />
      )}
    </>
  );
};

const PeriodSheet: React.FC<{ value: Period; onClose: () => void; onPick: (p: Period) => void }> = ({ value, onClose, onPick }) => {
  const [custom, setCustom] = useState(value.kind === 'custom');
  const [from, setFrom] = useState(value.from ?? '');
  const [to, setTo] = useState(value.to ?? '');

  const pick = (kind: PeriodKind) => {
    if (kind === 'custom') return setCustom(true);
    onPick({ kind, offset: 0 });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-[380px] bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">Choisis l'intervalle de temps</h2>
          <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PERIOD_KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => pick(k.id)}
              className={`py-3 rounded-2xl text-sm font-bold cursor-pointer transition ${k.id === 'custom' ? 'col-span-2' : ''} ${
                (k.id === 'custom' ? custom : value.kind === k.id && !custom) ? 'bg-[#D8FB52] text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {custom && (
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-slate-500">
                Du
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none" />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Au
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none" />
              </label>
            </div>
            <button
              disabled={!from || !to || to < from}
              onClick={() => onPick({ kind: 'custom', offset: 0, from, to })}
              className="w-full mt-3 py-3 rounded-2xl bg-[#D8FB52] disabled:opacity-40 text-slate-900 text-sm font-bold cursor-pointer"
            >
              Valider ces dates
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
