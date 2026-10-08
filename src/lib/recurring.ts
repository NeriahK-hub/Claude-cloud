import { Recurring } from '../types';

// Opérations qui reviennent et factures : dates, échéances dues, identifiant d'une échéance.

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const DAY = 86400000;
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY);

// Date suivante (fin de mois respectée : le 31 janvier -> le 28 ou 29 février)
export function nextAfter(day: string, r: Pick<Recurring, 'frequency' | 'everyDays' | 'every' | 'anchorDay'>): string {
  const d = parseDay(day);
  const n = Math.max(1, Math.round(r.every ?? 1));
  if (r.frequency === 'week') d.setDate(d.getDate() + 7 * n);
  else if (r.frequency === 'days') d.setDate(d.getDate() + Math.max(1, r.everyDays ?? 1));
  else {
    const months = (r.frequency === 'year' ? 12 : 1) * n;
    const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    // Le jour voulu (anchorDay) : un 31 ramené au 28 février revient au 31 en mars
    target.setDate(Math.min(r.anchorDay ?? d.getDate(), last));
    return ymd(target);
  }
  return ymd(d);
}

// Échéances passées ou d'aujourd'hui pas encore traitées (au plus `max`, les plus anciennes d'abord)
export function dueDates(r: Recurring, today: string, max = 12): string[] {
  const out: string[] = [];
  let d = r.nextDate;
  while (d <= today && out.length < max) {
    out.push(d);
    d = nextAfter(d, r);
  }
  return out;
}

// Échéances entre deux dates (incluses) : pour « À venir ce mois-ci »
export function occurrencesBetween(r: Recurring, from: string, to: string, max = 40): string[] {
  const out: string[] = [];
  let d = r.nextDate;
  for (let i = 0; d <= to && i < 400 && out.length < max; i++) {
    if (d >= from) out.push(d);
    d = nextAfter(d, r);
  }
  return out;
}

// Identifiant de l'opération créée pour une échéance : toujours le même pour la même échéance
// (deux téléphones qui la créent en même temps n'en font qu'une après la synchro)
export function occurrenceId(recurringId: string, day: string): string {
  const s = `${recurringId}|${day}`;
  const hash = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  };
  const hex = (hash(1) + hash(2)).split('');
  hex[12] = '5'; // version 5 (dérivé d'un nom)
  hex[16] = '89ab'[parseInt(hex[16], 16) & 3]; // variante RFC 4122
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Où en est une échéance : 'late' (date passée), 'today', 'soon' (facture dans les jours de rappel), null sinon
export function dueLevel(r: Recurring, today: string): 'late' | 'today' | 'soon' | null {
  if (!r.active) return null;
  const n = daysBetween(today, r.nextDate);
  if (n < 0) return 'late';
  if (n === 0) return 'today';
  if (r.bill && n <= (r.remindDays ?? 3)) return 'soon';
  return null;
}

// Factures toutes prêtes (titre, catégorie) pour aller plus vite
export const BILL_PRESETS: { title: string; categoryId: string }[] = [
  { title: 'SNEL', categoryId: 'bills-power' },
  { title: 'REGIDESO', categoryId: 'bills-water' },
  { title: 'Canal+', categoryId: 'bills-subs' },
  { title: 'Internet', categoryId: 'bills-internet' },
  { title: 'Minerval', categoryId: 'education-fees' },
  { title: 'Loyer', categoryId: 'bills-rent' },
];

export const FREQUENCY_LABEL: Record<Recurring['frequency'], string> = {
  week: 'Chaque semaine',
  month: 'Chaque mois',
  year: 'Chaque année',
  days: 'Tous les X jours',
};

// « Chaque mois », « Toutes les 2 semaines », « Tous les 3 mois », « Tous les 10 jours »
export const frequencyText = (r: Pick<Recurring, 'frequency' | 'everyDays' | 'every'>) => {
  const n = Math.max(1, Math.round(r.every ?? 1));
  if (r.frequency === 'days') return `Tous les ${r.everyDays ?? 1} jours`;
  if (n === 1) return FREQUENCY_LABEL[r.frequency];
  return r.frequency === 'week' ? `Toutes les ${n} semaines` : r.frequency === 'month' ? `Tous les ${n} mois` : `Tous les ${n} ans`;
};
