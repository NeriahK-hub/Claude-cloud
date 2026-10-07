import { useDisplayPrefs } from './display';
import { useFlag } from './remoteConfig';

// Design des fêtes : allumé depuis l'espace admin (Fonctionnalités › Design des fêtes).
// L'ambiance suit la date : Noël jusqu'au 26 décembre, Nouvel an du 27 décembre à fin janvier.
export type Festive = 'christmas' | 'newyear';

export function festiveFor(now = new Date()): Festive {
  return (now.getMonth() === 11 && now.getDate() >= 27) || now.getMonth() === 0 ? 'newyear' : 'christmas';
}

// null : pas de décoration (admin éteint, ou coupé par la personne dans Paramètres)
export function useFestive(): Festive | null {
  const on = useFlag('festive');
  const { festiveOff } = useDisplayPrefs();
  // Aperçu en local : ?festive=christmas ou ?festive=newyear (jamais en production)
  const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('festive') : null;
  if (preview === 'christmas' || preview === 'newyear') return festiveOff ? null : preview;
  return on && !festiveOff ? festiveFor() : null;
}

// L'admin a allumé les fêtes (même si la personne a coupé les décorations) : pour montrer le réglage
export function useFestiveAvailable(): boolean {
  const on = useFlag('festive');
  const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('festive') : null;
  return on || !!preview;
}

// Année qui commence (« Bonne année 2027 ») : en décembre, l'année suivante
export const newYearOf = (now = new Date()) => (now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear());
