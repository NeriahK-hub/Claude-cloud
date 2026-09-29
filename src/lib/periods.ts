// Périodes pour l'historique et le rapport : jour, semaine, mois, trimestre, année, tout, personnalisé.
// offset = 0 pour la période en cours, -1 pour la précédente, etc.

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

const pad = (n: number) => String(n).padStart(2, '0');

// Début (inclus) et fin (exclue) de la période
export function periodRange(p: Period, now = new Date()): { start: Date | null; end: Date | null } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (p.kind) {
    case 'day':
      return { start: new Date(y, m, d + p.offset), end: new Date(y, m, d + p.offset + 1) };
    case 'week': {
      const monday = d - ((now.getDay() + 6) % 7); // la semaine commence le lundi
      return { start: new Date(y, m, monday + 7 * p.offset), end: new Date(y, m, monday + 7 * (p.offset + 1)) };
    }
    case 'month':
      return { start: new Date(y, m + p.offset, 1), end: new Date(y, m + p.offset + 1, 1) };
    case 'quarter': {
      const q = Math.floor(m / 3) * 3;
      return { start: new Date(y, q + 3 * p.offset, 1), end: new Date(y, q + 3 * (p.offset + 1), 1) };
    }
    case 'year':
      return { start: new Date(y + p.offset, 0, 1), end: new Date(y + p.offset + 1, 0, 1) };
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

const short = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

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
    case 'month':
      return `${pad(start.getMonth() + 1)}/${start.getFullYear()}`;
    case 'quarter':
      return `T${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
    case 'year':
      return String(start.getFullYear());
    case 'custom': {
      const last = end ? new Date(end.getTime() - 86400000) : null;
      return last ? `${short(start)} – ${short(last)}` : `Depuis le ${short(start)}`;
    }
    default:
      return '';
  }
}
