import { Recurring, Settings, Transaction } from '../types';
import { Category } from '../data/categories';
import { topOf } from './insights';
import { isIncome, isSpending } from './review';
import { toMain } from './money';

// « Combien me faut-il par mois ? » : calculé sur les dépenses réelles des 3 derniers mois (devise principale).
// Chaque catégorie principale compte comme un besoin, du confort, ou est ignorée (le business n'est pas un coût de vie).

export type Kind = 'need' | 'comfort' | 'skip';
export type Level = 'essential' | 'comfort' | 'serene';

export const LEVELS: { id: Level; title: string; hint: string }[] = [
  { id: 'essential', title: 'Essentiel', hint: 'Les besoins' },
  { id: 'comfort', title: 'À l’aise', hint: 'Besoins + confort' },
  { id: 'serene', title: 'Sérénité', hint: 'Et de l’épargne' },
];

const DEFAULT_KIND: Record<string, Kind> = {
  food: 'need',
  transport: 'need',
  bills: 'need',
  health: 'need',
  education: 'need',
  family: 'need',
  shopping: 'comfort',
  fun: 'comfort',
  'other-expense': 'comfort',
  business: 'skip',
  'ristourne-out': 'skip',
};
export const kindOf = (id: string, overrides: Record<string, Kind>): Kind => overrides[id] ?? DEFAULT_KIND[id] ?? 'comfort';

const DAY = 86400000;

export interface LivingCat {
  id: string;
  name: string;
  icon: string;
  image?: string;
  color: string;
  month: number; // moyenne par mois
  kind: Kind;
}

export interface LivingResult {
  months: number; // mois d'historique utilisés (1 à 3)
  cats: LivingCat[];
  needs: number;
  comfort: number;
  income: number; // revenu moyen par mois
  hasData: boolean;
}

export function livingCost(txs: Transaction[], settings: Settings, categories: Category[], overrides: Record<string, Kind>, now = Date.now()): LivingResult {
  const from = now - 90 * DAY;
  let first = now;
  const byCat = new Map<string, LivingCat>();
  let income = 0;
  for (const t of txs) {
    const at = new Date(t.createdAt).getTime();
    if (at < from || at > now) continue;
    if (isSpending(t)) {
      first = Math.min(first, at);
      const c = topOf(t, categories);
      const cur = byCat.get(c.id) ?? { id: c.id, name: c.name, icon: c.icon, image: c.image, color: c.color, month: 0, kind: kindOf(c.id, overrides) };
      cur.month += -toMain(t.amount, t.currency, settings);
      byCat.set(c.id, cur);
    } else if (isIncome(t)) {
      first = Math.min(first, at);
      income += toMain(t.amount, t.currency, settings);
    }
  }
  const months = Math.min(3, Math.max(1, Math.ceil((now - first) / (30 * DAY))));
  const cats = [...byCat.values()].map((c) => ({ ...c, month: c.month / months })).sort((a, b) => b.month - a.month);
  const sum = (k: Kind) => cats.filter((c) => c.kind === k).reduce((s, c) => s + c.month, 0);
  return { months, cats, needs: sum('need'), comfort: sum('comfort'), income: income / months, hasData: cats.length > 0 };
}

// Ce qu'il faut gagner par mois pour chaque niveau
export function needed(r: Pick<LivingResult, 'needs' | 'comfort'>, level: Level, savePct: number): number {
  if (level === 'essential') return r.needs;
  const comfy = (r.needs + r.comfort) * 1.1; // + 10 % pour les imprévus
  if (level === 'comfort') return comfy;
  return comfy / Math.max(0.5, 1 - savePct / 100);
}

// Coût mensuel de ce qui revient (À venir) : sorties à montant fixe, ramenées au mois
export function recurringPerMonth(recurrings: Recurring[], settings: Settings): number {
  return recurrings
    .filter((r) => r.active && r.direction === 'out' && r.amount)
    .reduce((s, r) => {
      const n = Math.max(1, (r.frequency === 'days' ? r.everyDays : r.every) ?? 1);
      const per = r.frequency === 'week' ? 52 / 12 / n : r.frequency === 'days' ? 30.4 / n : r.frequency === 'year' ? 1 / (12 * n) : 1 / n;
      return s + toMain(r.amount!, r.currency, settings) * per;
    }, 0);
}

// Revenus de ce mois-ci (devise principale)
export function incomeThisMonth(txs: Transaction[], settings: Settings, now = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return txs.filter((t) => isIncome(t) && new Date(t.createdAt).getTime() >= start).reduce((s, t) => s + toMain(t.amount, t.currency, settings), 0);
}
