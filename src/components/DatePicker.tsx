import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';

// Calendrier de l'app (le même partout, au lieu de celui du navigateur).
// Jours au format « 2026-09-30 », en heure locale ; semaine du lundi au dimanche.

export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Raccourcis au-dessus du calendrier, selon ce qu'on choisit
export type Shortcuts = 'past' | 'future' | 'start' | 'none';
function shortcutsFor(kind: Shortcuts): [string, string][] {
  const now = new Date();
  if (kind === 'past') return [["Aujourd'hui", localDay(now)], ['Hier', localDay(addDays(now, -1))], ['Avant-hier', localDay(addDays(now, -2))]];
  if (kind === 'future')
    return [['1 mois', localDay(addMonths(now, 1))], ['3 mois', localDay(addMonths(now, 3))], ['6 mois', localDay(addMonths(now, 6))], ['1 an', localDay(addMonths(now, 12))]];
  if (kind === 'start') return [["Aujourd'hui", localDay(now)], ['Demain', localDay(addDays(now, 1))], ['+ 1 semaine', localDay(addDays(now, 7))]];
  return [];
}

// « Aujourd'hui », « Hier », « Demain », sinon « 31 oct. 2026 »
export function formatDay(day: string): string {
  const now = new Date();
  if (day === localDay(now)) return "Aujourd'hui";
  if (day === localDay(addDays(now, -1))) return 'Hier';
  if (day === localDay(addDays(now, 1))) return 'Demain';
  return new Date(`${day}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const DatePicker: React.FC<{
  value: string; // '' = pas de date
  onChange: (day: string) => void;
  shortcuts?: Shortcuts;
  min?: string; // les jours avant sont grisés
  emptyIsToday?: boolean; // '' veut dire « aujourd'hui » (ajout d'une opération)
}> = ({ value, onChange, shortcuts = 'past', min, emptyIsToday = true }) => {
  const now = new Date();
  const today = localDay(now);
  const picked = value || (emptyIsToday ? today : '');
  const [view, setView] = useState(() => {
    const [y, m] = (picked || (min && min > today ? min : today)).split('-').map(Number);
    return { y, m: m - 1 };
  });
  const move = (n: number) => setView(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  const show = (day: string) => {
    const [y, m] = day.split('-').map(Number);
    setView({ y, m: m - 1 });
  };

  // Du lundi avant le 1er jusqu'à la fin de la semaine du dernier jour (5 ou 6 semaines)
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(first, -lead);
  const weeks = Math.ceil((lead + new Date(view.y, view.m + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const title = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const quick = shortcutsFor(shortcuts).filter(([, d]) => !min || d >= min);

  return (
    <div className="animate-fade-in">
      {quick.length > 0 && (
        <div className="flex gap-1.5 mb-3">
          {quick.map(([label, day]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                show(day);
                onChange(day);
              }}
              className={`flex-1 min-w-0 py-2 px-1 rounded-xl text-xs font-bold truncate cursor-pointer transition ${
                picked === day ? 'bg-accent text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-1.5">
        <button type="button" onClick={() => move(-1)} aria-label="Mois précédent" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-bold text-slate-900 first-letter:uppercase">{title}</div>
        <button type="button" onClick={() => move(1)} aria-label="Mois suivant" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-0.5">
        {WEEK.map((d, i) => (
          <div key={i} className={`h-6 flex items-center justify-center text-[12px] font-bold ${i >= 5 ? 'text-slate-400' : 'text-slate-500'}`}>
            {d}
          </div>
        ))}
      </div>
      <div key={`${view.y}-${view.m}`} className="grid grid-cols-7 gap-y-0.5 animate-fade-in">
        {days.map((d) => {
          const key = localDay(d);
          const inMonth = d.getMonth() === view.m;
          const isPicked = key === picked;
          const isToday = key === today;
          const disabled = !!min && key < min;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (!inMonth) show(key);
                onChange(key);
              }}
              aria-label={d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              aria-pressed={isPicked}
              className="h-9 flex items-center justify-center cursor-pointer disabled:cursor-default disabled:opacity-30"
            >
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm tabular-nums transition ${
                  isPicked
                    ? 'bg-accent text-slate-900 font-extrabold shadow-sm'
                    : isToday
                      ? 'ring-1 ring-inset ring-slate-400 text-slate-900 font-bold'
                      : inMonth
                        ? 'text-slate-800 font-semibold hover:bg-slate-100'
                        : 'text-slate-300 hover:bg-slate-100'
                }`}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Champ date d'un formulaire : un bouton qui affiche la date ; le calendrier de l'app se déplie
// juste en dessous (pas de fenêtre en plus, rien qui dépasse de l'écran).
export const DateField: React.FC<{
  value: string;
  onChange: (day: string) => void;
  placeholder?: string; // champ facultatif : texte quand il est vide + bouton pour effacer
  shortcuts?: Shortcuts;
  min?: string;
  label?: string; // pour les lecteurs d'écran
  className?: string;
}> = ({ value, onChange, placeholder, shortcuts = 'none', min, label, className = '' }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  return (
    <div ref={box} className={className}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={label ? `${label} : ${value ? formatDay(value) : placeholder ?? 'aucune'}` : undefined}
          className={`min-w-0 flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl text-sm text-left cursor-pointer transition ${open ? 'is-open' : 'bg-slate-100 hover:bg-slate-200/70'}`}
        >
          <CalendarDays className="w-4 h-4 shrink-0 text-slate-500" />
          <span className={`flex-1 min-w-0 truncate ${value ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>
            {value ? formatDay(value) : placeholder ?? 'Choisir une date'}
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {placeholder && value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            aria-label="Effacer la date"
            className="shrink-0 w-11 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 p-3 rounded-2xl border border-slate-200/70">
          <DatePicker
            value={value}
            emptyIsToday={false}
            shortcuts={shortcuts}
            min={min}
            onChange={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
};
