// Périodes pour l'historique et le rapport : jour, semaine, mois, trimestre, année, tout, personnalisé.
// offset = 0 pour la période en cours, -1 pour la précédente, etc.
import { formatDate, getPrefs } from './display';

export type PeriodKind = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';

export interface Period {
  kind: PeriodKind;
  offset: number;
  from?: string; // personnalisé : AAAA-MM-JJ (inclus)
  to?: string; // personnalisé : AAAA-MM-JJ (inclus)
}

export const PERIOD_KINDS: { id: PeriodKind; label: string }[] = [
  { id: 'day', label: 'Jour' },
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'year', label: 'Année' },
  { id: 'all', label: 'Tous' },
  { id: 'custom', label: 'Personnalisé' },
];


// Début (inclus) et fin (exclue) de la période.
// Suit Paramètres › Affichage : premier jour de la semaine, du mois (ex. 25 = mois de paie), de l'année.
export function periodRange(p: Period, now = new Date()): { start: Date | null; end: Date | null } {
  const { weekStart, monthStart, yearStart } = getPrefs();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (p.kind) {
    case 'day':
      return { start: new Date(y, m, d + p.offset), end: new Date(y, m, d + p.offset + 1) };
    case 'week': {
      const first = d - ((now.getDay() - weekStart + 7) % 7);
      return { start: new Date(y, m, first + 7 * p.offset), end: new Date(y, m, first + 7 * (p.offset + 1)) };
    }
    case 'month': {
      // Le mois en cours a commencé ce mois-ci si on a passé le jour de départ, sinon le mois dernier
      const base = d >= monthStart ? m : m - 1;
      return { start: new Date(y, base + p.offset, monthStart), end: new Date(y, base + p.offset + 1, monthStart) };
    }
    case 'quarter': {
      const fy = m >= yearStart ? y : y - 1; // début de l'année (exercice) en cours
      const q = Math.floor(((m - yearStart + 12) % 12) / 3);
      return { start: new Date(fy, yearStart + 3 * (q + p.offset), 1), end: new Date(fy, yearStart + 3 * (q + p.offset + 1), 1) };
    }
    case 'year': {
      const fy = m >= yearStart ? y : y - 1;
      return { start: new Date(fy + p.offset, yearStart, 1), end: new Date(fy + p.offset + 1, yearStart, 1) };
    }
    case 'custom': {
      const from = p.from ? new Date(p.from + 'T00:00') : null;
      const to = p.to ? new Date(p.to + 'T00:00') : null;
      if (to) to.setDate(to.getDate() + 1);
      return { start: from, end: to };
    }
    default:
      return { start: null, end: null };
  }
}

export function inPeriod(iso: string, range: { start: Date | null; end: Date | null }): boolean {
  const t = new Date(iso).getTime();
  return (!range.start || t >= range.start.getTime()) && (!range.end || t < range.end.getTime());
}

const short = (d: Date) => formatDate(d, true);

export function periodLabel(p: Period, now = new Date()): string {
  const { start, end } = periodRange(p, now);
  const recent: Partial<Record<PeriodKind, [string, string]>> = {
    day: ["Aujourd'hui", 'Hier'],
    week: ['Cette semaine', 'La semaine dernière'],
    month: ['Ce mois-ci', 'Le mois dernier'],
    quarter: ['Ce trimestre', 'Le trimestre dernier'],
    year: ['Cette année', "L'année dernière"],
  };
  const r = recent[p.kind];
  if (r && p.offset === 0) return r[0];
  if (r && p.offset === -1) return r[1];
  if (!start) return p.kind === 'all' ? 'Depuis le début' : 'Choisis des dates';
  switch (p.kind) {
    case 'day':
      return short(start);
    case 'week': {
      const last = new Date(end!.getTime() - 86400000);
      return `${short(start)} – ${short(last)}`;
    }
    case 'month': {
      if (getPrefs().monthStart !== 1) return `${short(start)} – ${short(new Date(end!.getTime() - 86400000))}`;
      const label = start.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    case 'quarter': {
      const ys = getPrefs().yearStart;
      return `T${Math.floor(((start.getMonth() - ys + 12) % 12) / 3) + 1} ${start.getFullYear()}`;
    }
    case 'year': {
      const last = new Date(end!.getTime() - 86400000);
      return last.getFullYear() === start.getFullYear() ? String(start.getFullYear()) : `${start.getFullYear()}–${last.getFullYear()}`;
    }
    case 'custom': {
      const last = end ? new Date(end.getTime() - 86400000) : null;
      return last ? `${short(start)} – ${short(last)}` : `Depuis le ${short(start)}`;
    }
    default:
      return '';
  }
}

// Titre d'un mois (budgets) : « Septembre 2026 », ou « 25/08 – 24/09 » si le mois commence un autre jour
export function monthTitle(offset: number, now = new Date()): string {
  const { start, end } = periodRange({ kind: 'month', offset }, now);
  if (getPrefs().monthStart !== 1) return `${formatDate(start!, true)} – ${formatDate(new Date(end!.getTime() - 86400000), true)}`;
  const s = start!.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// La date tombe-t-elle dans le mois en cours (selon le premier jour du mois choisi) ?
export const inThisMonth = (iso: string, now = new Date()) => inPeriod(iso, periodRange({ kind: 'month', offset: 0 }, now));
