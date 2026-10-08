import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Recurring, Settings } from '../types';
import { Category } from '../data/categories';
import { convertBetween } from '../lib/money';
import { occurrencesBetween, ymd } from '../lib/recurring';
import { getPrefs } from '../lib/display';
import { IconBadge } from './AppIcon';
import { money } from './DueCard';

// « À venir » en calendrier : un mois, des points sous les jours où quelque chose est prévu,
// et la liste du jour touché.
const LETTERS: Record<number, string[]> = {
  1: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
  0: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  6: ['S', 'D', 'L', 'M', 'M', 'J', 'V'],
};

export const UpcomingCalendar: React.FC<{
  recurrings: Recurring[];
  categories: Category[];
  settings: Settings;
  onEdit: (r: Recurring) => void;
}> = ({ recurrings, categories, settings, onEdit }) => {
  const weekStart = getPrefs().weekStart;
  const today = ymd(new Date());
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(today);

  const first = new Date(cursor.y, cursor.m, 1);
  const last = new Date(cursor.y, cursor.m + 1, 0);
  // Jours prévus ce mois-là : jour -> opérations
  const byDay = useMemo(() => {
    const map = new Map<string, Recurring[]>();
    for (const r of recurrings.filter((x) => x.active)) {
      for (const day of occurrencesBetween(r, ymd(first), ymd(last))) map.set(day, [...(map.get(day) ?? []), r]);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurrings, cursor.y, cursor.m]);

  const main = (r: Recurring) => (r.amount ? convertBetween(r.amount, r.currency, settings.mainCurrency, settings) ?? 0 : 0);
  const out = [...byDay.values()].flat().filter((r) => r.direction === 'out').reduce((s, r) => s + main(r), 0);
  const inn = [...byDay.values()].flat().filter((r) => r.direction === 'in').reduce((s, r) => s + main(r), 0);

  // Cases vides avant le 1er, selon le premier jour de la semaine choisi
  const lead = (first.getDay() - weekStart + 7) % 7;
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: last.getDate() }, (_, i) => i + 1)];
  const dayKey = (d: number) => ymd(new Date(cursor.y, cursor.m, d));
  const shift = (n: number) => {
    const d = new Date(cursor.y, cursor.m + n, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(null);
  };
  const title = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const items = selected ? byDay.get(selected) ?? [] : [];
  const catOf = (id?: string) => categories.find((c) => c.id === id);

  return (
    <div className="mb-5">
      <div className="bg-white rounded-3xl border border-slate-100 p-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => shift(-1)} aria-label="Mois précédent" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer active:scale-90 transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[16px] font-bold text-slate-900 capitalize">{title}</span>
          <button onClick={() => shift(1)} aria-label="Mois suivant" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer active:scale-90 transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center mb-1">
          {LETTERS[weekStart].map((l, i) => (
            <span key={i} className="text-[11px] font-semibold text-slate-400 py-1">
              {l}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (d === null) return <span key={`e${i}`} />;
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const on = selected === k;
            return (
              <button
                key={k}
                onClick={() => setSelected(on ? null : k)}
                aria-label={`${d} ${title}${list.length ? `, ${list.length} prévu${list.length > 1 ? 's' : ''}` : ''}`}
                aria-pressed={on}
                className={`h-12 rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer transition active:scale-95 ${on ? 'is-selected' : 'hover:bg-slate-50'}`}
              >
                <span className={`text-[14px] leading-none ${k === today ? 'w-6 h-6 rounded-full bg-accent text-on-accent flex items-center justify-center font-bold' : 'font-semibold text-slate-800'}`}>{d}</span>
                <span className="flex gap-0.5 h-1.5">
                  {list.slice(0, 3).map((r, j) => (
                    <span key={j} className={`w-1.5 h-1.5 rounded-full ${r.direction === 'in' ? 'bg-emerald-500' : r.bill ? 'bg-amber-500' : 'bg-red-500'}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {(out > 0 || inn > 0) && (
          <div className="flex justify-between gap-3 mt-3 pt-3 border-t border-slate-100 text-[13px]">
            <span className="text-slate-500">
              À payer <b className="text-slate-900 tabular-nums">{money(out, settings.mainCurrency)}</b>
            </span>
            {inn > 0 && (
              <span className="text-slate-500">
                À recevoir <b className="text-emerald-600 tabular-nums">{money(inn, settings.mainCurrency)}</b>
              </span>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-3 animate-fade-in">
          <div className="text-[12px] font-bold text-slate-400 tracking-wider uppercase mb-2 px-1">
            {new Date(selected + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {items.length === 0 ? (
            <p className="text-[14px] text-slate-400 px-1">Rien de prévu ce jour-là.</p>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 px-4 divide-y divide-slate-100">
              {items.map((r) => {
                const c = catOf(r.categoryId);
                return (
                  <button key={r.id} onClick={() => onEdit(r)} className="w-full py-3 flex items-center gap-3 text-left cursor-pointer">
                    <IconBadge icon={c?.icon ?? (r.bill ? 'Receipt' : 'Repeat')} image={c?.image} color={c?.color ?? '#64748B'} size="sm" />
                    <span className="flex-1 min-w-0 text-[14px] font-semibold text-slate-900 truncate">{r.title}</span>
                    <span className={`text-[14px] font-bold tabular-nums shrink-0 ${r.direction === 'in' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {r.amount ? `${r.direction === 'in' ? '+' : '−'}${money(r.amount, r.currency)}` : <span className="text-[12px] font-semibold text-slate-400">à saisir</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
