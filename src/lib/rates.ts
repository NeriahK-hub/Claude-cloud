// Taux de change automatiques (Paramètres › Taux de change › Automatique)
// Source gratuite et sans clé : open.er-api.com (ExchangeRate-API), mise à jour une fois par jour.
// Les taux restent dans les réglages comme ceux tapés à la main : l'app marche hors ligne avec les derniers.
import { useSyncExternalStore } from 'react';

const KEY = 'ap.autoRates'; // { on: boolean, at?: ISO de la dernière mise à jour }
const EVERY = 6 * 60 * 60 * 1000; // on ne redemande pas plus d'une fois toutes les 6 h

interface AutoRates {
  on: boolean;
  at?: string;
  main?: string; // devise principale de la dernière mise à jour
  codes?: string; // devises demandées (une nouvelle devise = nouvelle demande)
}

const read = (): AutoRates => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{"on":false}');
  } catch {
    return { on: false };
  }
};
let state = typeof window === 'undefined' ? { on: false } : read();
const listeners = new Set<() => void>();
const write = (next: AutoRates) => {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // stockage bloqué : le réglage dure le temps de la session
  }
  listeners.forEach((l) => l());
};

export function useAutoRates(): AutoRates {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export const setAutoRates = (on: boolean) => write({ on }); // activer : mise à jour tout de suite

// Taux du marché pour les devises demandées : combien de devise principale vaut 1 unité de chacune
export async function fetchRates(main: string, codes: string[]): Promise<Record<string, number>> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(main)}`);
  if (!res.ok) throw new Error('Taux indisponibles');
  const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (json.result !== 'success' || !json.rates) throw new Error('Taux indisponibles');
  const out: Record<string, number> = {};
  for (const c of codes) {
    const perMain = json.rates[c]; // combien de c pour 1 unité de la devise principale
    if (perMain && perMain > 0) out[c] = Number((1 / perMain).toPrecision(8)); // 8 chiffres : 0,00043294 comme 2309,8012
  }
  return out;
}

// Taux du marché à jour si l'option est active et que les derniers ont plus de 6 h (ou si la devise
// principale a changé). Renvoie les nouveaux taux, ou null s'il n'y a rien à demander.
export async function refreshRates(main: string, codes: string[]): Promise<Record<string, number> | null> {
  if (!state.on || !codes.length || (typeof navigator !== 'undefined' && !navigator.onLine)) return null;
  const key = codes.join(',');
  if (state.main === main && state.codes === key && state.at && Date.now() - new Date(state.at).getTime() < EVERY) return null;
  const fresh = await fetchRates(main, codes);
  write({ on: true, at: new Date().toISOString(), main, codes: key });
  return fresh;
}
