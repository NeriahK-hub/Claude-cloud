import { useMemo } from 'react';
import { useDisplayPrefs } from './display';

// Accueil au choix : quelles cartes, dans quel ordre (Paramètres › Accueil).
// Les bilans (semaine, Wrapped) et les fêtes ne sont pas au choix : ils viennent tout seuls, ou quand l'admin les allume.
// Les cartes ajoutées plus tard à l'app arrivent à la fin, sans rien casser.

export type HomeCardId = 'wallet' | 'rates' | 'due' | 'health' | 'badges' | 'month' | 'subs' | 'budgets' | 'goals' | 'list';

export const HOME_CARDS: { id: HomeCardId; label: string; hint: string }[] = [
  { id: 'wallet', label: 'Portefeuille choisi', hint: 'Objectif, crédit ou partage' },
  { id: 'rates', label: 'Taux de change', hint: 'Dollar et franc du jour' },
  { id: 'due', label: 'À payer bientôt', hint: 'Factures et rappels à venir' },
  { id: 'health', label: 'Santé financière', hint: 'Ta note sur 100' },
  { id: 'badges', label: 'Série et badges', hint: 'Tes jours de suite' },
  { id: 'month', label: 'Résumé du mois', hint: 'Entrées, sorties, prévision' },
  { id: 'subs', label: 'Abonnements repérés', hint: 'À ajouter dans À venir' },
  { id: 'budgets', label: 'Budgets', hint: 'Les plus remplis' },
  { id: 'goals', label: 'Objectifs', hint: 'Ton épargne' },
  { id: 'list', label: 'Dernières opérations', hint: 'Les plus récentes' },
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
