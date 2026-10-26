import { useEffect, useState } from 'react';
import { getClient } from './sync/useCloud';
import type { Cloud } from './sync/useCloud';
import { ProFeature, useFlag, useRemoteConfig } from './remoteConfig';

// Wallo Pro : l'offre n'apparaît que si l'admin l'allume (fonctionnalité « pro »). Pas de prix ni de paiement
// pour l'instant : l'admin donne l'accès à un compte (fonction my_pro de la base).
// Aperçu sur cet appareil seulement : voir proPreview.ts (?pro=apercu).

const PREVIEW_KEY = 'ap.proPreview';
const ACTIVE_KEY = 'ap.proActive';

const flag = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

// Liste de départ, tant que l'admin n'a rien réglé (même contenu que la base)
export const DEFAULT_PRO_FEATURES: ProFeature[] = [
  { id: 'd1', label: 'Portefeuilles en dollars et en francs', description: 'Autant de portefeuilles que tu veux, USD et CDF.', tier: 'free' },
  { id: 'd2', label: 'Opérations et catégories', description: 'Noter tes dépenses et revenus, sans limite.', tier: 'free' },
  { id: 'd3', label: 'Budgets', description: 'Un budget par catégorie, avec le rythme du mois.', tier: 'free' },
  { id: 'd4', label: 'Dettes et prêts', description: 'Qui te doit, à qui tu dois, avec les rappels.', tier: 'free' },
  { id: 'd5', label: 'Portefeuilles partagés', description: 'Suivre l’argent à plusieurs, en direct.', tier: 'pro' },
  { id: 'd6', label: 'Synchro sur tous tes appareils', description: 'Ton compte et tes données partout, en sécurité.', tier: 'pro' },
  { id: 'd7', label: 'Rapports en PDF et Excel', description: 'Exporter tes rapports pour les partager.', tier: 'pro' },
  { id: 'd8', label: 'Analyses avancées', description: 'Courbe sur 12 mois, simulateur, dépenses inhabituelles.', tier: 'pro' },
];

export function usePro(cloud: Cloud) {
  const on = useFlag('pro');
  const preview = flag(PREVIEW_KEY);
  const config = useRemoteConfig().pro;
  const [granted, setGranted] = useState(() => flag(ACTIVE_KEY));
  const uid = cloud.user?.id;

  useEffect(() => {
    if (!uid) {
      setGranted(false);
      return;
    }
    let alive = true;
    getClient()
      .then((sb) => sb.rpc('my_pro'))
      .then(({ data, error }) => {
        if (!alive || error) return; // base pas à jour ou hors ligne : on garde la dernière réponse
        setGranted(!!data);
        try {
          localStorage.setItem(ACTIVE_KEY, data ? '1' : '0');
        } catch {
          // rien
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  return {
    offer: on || preview, // montrer l'offre ?
    preview: !on && preview,
    active: granted,
    features: config.length ? config : DEFAULT_PRO_FEATURES,
  };
}
