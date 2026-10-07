import { useSyncExternalStore } from 'react';
import { cloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { onOtherTabChange } from './crossTab';
import { fetchRates } from './rates';

// Taux du jour USD -> CDF
// • marché (cambistes) : publié chaque jour depuis l'espace admin (fonction market_rates de la base) ;
//   chaque personne peut le remplacer par le sien (« mine », gardé sur ce téléphone) ;
// • officiel : open.er-api.com (comme les taux automatiques), noté une fois par jour pour l'historique.
// Tout est gardé sur l'appareil : l'app affiche le dernier taux connu hors ligne.

export interface DayRate {
  day: string; // AAAA-MM-JJ
  rate: number; // francs congolais pour 1 dollar
}

interface State {
  market: DayRate[]; // du plus récent au plus ancien (espace admin)
  official: DayRate[];
  mine?: { rate: number; day: string }; // mon taux du marché (remplace celui de Wallo)
  at?: string; // dernière mise à jour réussie
}

const KEY = 'ap.marketRates';
const EMPTY: State = { market: [], official: [] };
const read = (): State => {
  try {
    return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}) };
  } catch {
    return EMPTY;
  }
};
let state: State = typeof window === 'undefined' ? EMPTY : read();
const listeners = new Set<() => void>();
const write = (next: State) => {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // stockage plein : gardé pour la session
  }
  listeners.forEach((l) => l());
};
if (typeof window !== 'undefined') {
  onOtherTabChange(KEY, () => {
    state = read();
    listeners.forEach((l) => l());
  });
}

export function useMarketRates(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}
export const getMarketRates = () => state;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Mon propre taux (null = revenir à celui de Wallo)
export function setMyMarketRate(rate: number | null) {
  write({ ...state, mine: rate && rate > 0 ? { rate, day: today() } : undefined });
}

let inFlight = false;
let last = 0;

// Au démarrage puis au retour dans l'app (au plus toutes les 30 minutes)
export async function refreshMarketRates(force = false) {
  if (inFlight || (!force && Date.now() - last < 30 * 60_000)) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  inFlight = true;
  last = Date.now();
  let next = { ...state };
  try {
    if (cloudConfigured) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/market_rates`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      // 404 : base pas encore à jour -> on garde ce qu'on a
      if (res.ok) {
        const rows = (await res.json()) as { day: string; usd_cdf: number }[];
        if (Array.isArray(rows)) {
          next.market = rows
            .filter((r) => r && typeof r.day === 'string' && Number(r.usd_cdf) > 0)
            .map((r) => ({ day: r.day.slice(0, 10), rate: Number(r.usd_cdf) }));
        }
      }
    }
  } catch {
    // hors ligne : on garde le dernier
  }
  try {
    // Officiel : une fois par jour suffit
    if (next.official[0]?.day !== today()) {
      const r = await fetchRates('CDF', ['USD']);
      if (r.USD > 0) next.official = [{ day: today(), rate: Math.round(r.USD * 100) / 100 }, ...next.official.filter((x) => x.day !== today())].slice(0, 60);
    }
    next = { ...next, at: new Date().toISOString() };
  } catch {
    // pas grave
  }
  inFlight = false;
  if (JSON.stringify(next) !== JSON.stringify(state)) write(next);
}

export function initMarketRates() {
  refreshMarketRates(true);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshMarketRates());
  window.addEventListener('online', () => refreshMarketRates(true));
}

// Taux du marché à utiliser : le mien s'il est noté, sinon celui de Wallo ; et sa variation sur la veille
export function currentMarket(s: State): { rate: number; day: string; mine: boolean; change: number | null } | null {
  if (s.mine) {
    const prev = s.market[0]?.rate;
    return { rate: s.mine.rate, day: s.mine.day, mine: true, change: prev ? (s.mine.rate - prev) / prev : null };
  }
  const [a, b] = s.market;
  if (!a) return null;
  return { rate: a.rate, day: a.day, mine: false, change: b ? (a.rate - b.rate) / b.rate : null };
}

export function currentOfficial(s: State): { rate: number; day: string; change: number | null } | null {
  const [a, b] = s.official;
  if (!a) return null;
  return { rate: a.rate, day: a.day, change: b ? (a.rate - b.rate) / b.rate : null };
}
