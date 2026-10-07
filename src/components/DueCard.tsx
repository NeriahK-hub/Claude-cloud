import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Recurring } from '../types';
import { Category } from '../data/categories';
import { formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';
import { daysBetween, dueLevel, parseDay, ymd } from '../lib/recurring';
import { IconBadge } from './AppIcon';

// Carte « À faire » de l'accueil (chargée au démarrage) ; la page « À venir » complète se charge à l'ouverture.

export const money = (v: number, c: string) => formatMoney(v, c, { ...getPrefs(), decimals: 'auto' });
export const dayText = (day: string) => parseDay(day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

// Quand : « Aujourd'hui », « Demain », « Dans 5 jours », « En retard de 2 jours »
export function whenText(day: string, today = ymd(new Date())): string {
  const n = daysBetween(today, day);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return 'Demain';
  if (n === -1) return 'Hier';
  if (n < 0) return `En retard de ${-n} jours`;
  if (n < 7) return `Dans ${n} jours`;
  return dayText(day);
}

// Ce qui attend une réponse aujourd'hui : échéances passées ou du jour (pas les automatiques),
// et les factures dans leurs jours de rappel
export function pendingRecurrings(list: Recurring[], today = ymd(new Date())): Recurring[] {
  return list
    .filter((r) => {
      const lvl = dueLevel(r, today);
      if (!lvl) return false;
      if (lvl === 'soon') return !!r.bill;
      return r.bill || r.mode === 'ask' || !r.amount;
    })
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

// ---------- Carte de l'accueil : une ligne par chose à faire, un seul bouton ----------
export const DueCard: React.FC<{
  recurrings: Recurring[];
  categories: Category[];
  onConfirm: (r: Recurring, amount?: number) => void;
  onSkip: (r: Recurring) => void;
  onOpen: () => void;
}> = ({ recurrings, categories, onConfirm, onOpen }) => {
  const pending = pendingRecurrings(recurrings);
  if (!pending.length) return null;
  const today = ymd(new Date());
  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold text-slate-900">À faire · {pending.length}</h2>
        <button onClick={onOpen} className="flex items-center gap-0.5 text-xs font-bold text-emerald-700 cursor-pointer">
          Tout voir <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <ul className="divide-y divide-slate-100">
        {pending.slice(0, 3).map((r) => {
          const cat = categories.find((c) => c.id === r.categoryId);
          const late = r.nextDate < today;
          const when = r.bill && r.nextDate > today ? `avant ${dayText(r.nextDate)}` : whenText(r.nextDate, today).toLowerCase();
          return (
            <li key={r.id} className="py-2.5 flex items-center gap-3">
              <IconBadge icon={cat?.icon ?? (r.bill ? 'Receipt' : 'Repeat')} image={cat?.image} color={cat?.color ?? '#64748B'} size="sm" />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold text-slate-900 truncate">
                  {r.title}
                  {r.amount && <span className="font-normal text-slate-500"> · {money(r.amount, r.currency)}</span>}
                </span>
                <span className={`block text-[12px] ${late ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>{when}</span>
              </span>
              {r.amount ? (
                <button
                  onClick={() => onConfirm(r)}
                  className="shrink-0 h-9 px-3.5 rounded-xl bg-accent hover:bg-accent-hover text-[13px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition"
                >
                  <Check className="w-4 h-4 stroke-[2.6]" /> {r.direction === 'in' ? 'Reçu' : 'Payé'}
                </button>
              ) : (
                // Montant qui change : on le tape sur la page À venir
                <button onClick={onOpen} className="shrink-0 h-9 px-3.5 rounded-xl bg-slate-100 text-[13px] font-bold text-slate-700 cursor-pointer">
                  Payer
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {pending.length > 3 && (
        <button onClick={onOpen} className="text-xs font-semibold text-slate-500 pt-1 cursor-pointer">
          Et {pending.length - 3} autre{pending.length > 4 ? 's' : ''}…
        </button>
      )}
    </div>
  );
};

