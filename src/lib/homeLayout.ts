import { useMemo } from 'react';
import { useDisplayPrefs } from './display';

// Accueil au choix : quelles cartes, dans quel ordre (Paramètres › Accueil).
// Les cartes ajoutées plus tard à l'app arrivent à la fin, sans rien casser.

export type HomeCardId = 'review' | 'rates' | 'due' | 'health' | 'badges' | 'month' | 'subs' | 'list';

export const HOME_CARDS: { id: HomeCardId; label: string; hint: string }[] = [
  { id: 'review', label: 'Bilans', hint: 'Ta semaine, ton Wrapped de fin d’année' },
  { id: 'rates', label: 'Taux de change', hint: 'Le taux du jour entre dollar et franc' },
  { id: 'due', label: 'À payer bientôt', hint: 'Factures et opérations qui reviennent' },
  { id: 'health', label: 'Santé financière', hint: 'Ta note sur 100 et un conseil' },
  { id: 'badges', label: 'Série et badges', hint: 'Les jours de suite où tu notes tes dépenses' },
  { id: 'month', label: 'Résumé du mois', hint: 'Entrées, sorties et prévision' },
  { id: 'subs', label: 'Abonnements', hint: 'Ce que tes abonnements coûtent chaque mois' },
  { id: 'list', label: 'Dernières opérations', hint: 'Les opérations les plus récentes' },
];

const IDS = HOME_CARDS.map((c) => c.id);

// Ordre complet : celui choisi, puis les cartes qu'il ne connaît pas encore
export const fullOrder = (saved: string[]): HomeCardId[] => {
  const known = saved.filter((id): id is HomeCardId => (IDS as string[]).includes(id));
  return [...new Set([...known, ...IDS])];
};

export function useHomeLayout() {
  const { homeOrder, homeHidden } = useDisplayPrefs();
  return useMemo(() => {
    const all = fullOrder(homeOrder);
    const shown = all.filter((id) => !homeHidden.includes(id));
    return { all, shown, show: (id: HomeCardId) => !homeHidden.includes(id) };
  }, [homeOrder, homeHidden]);
}
