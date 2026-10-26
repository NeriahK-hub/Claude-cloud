import { useSyncExternalStore } from 'react';
import { onOtherTabChange } from './crossTab';
import { markPrefsChanged } from './prefsStamp';

// Préférences d'affichage de cet appareil (Paramètres › Affichage).
// Lues partout sans passer par les composants : formatMoney, périodes, dates.

export interface DisplayPrefs {
  number: 'fr' | 'en' | 'de' | 'ch'; // 1 234,56 · 1,234.56 · 1.234,56 · 1’234.56
  decimals: 'always' | 'auto' | 'never'; // centimes : toujours, si nécessaire, jamais
  date: 'dmy' | 'mdy' | 'ymd'; // 29/09/2026 · 09/29/2026 · 2026-09-29
  weekStart: 0 | 1 | 6; // dimanche, lundi, samedi
  monthStart: number; // 1 à 28 (ex. 25 = mois de paie du 25 au 24)
  yearStart: number; // 0 = janvier … 11 = décembre
  excludeOption: boolean; // interrupteur « Exclure du rapport » dans les formulaires
  hideBalance: boolean; // solde masqué sur l'accueil (bouton œil)
  homeWalletCard: boolean; // carte du portefeuille choisi (objectif, crédit, partagé) sur l'accueil
  simpleMode: boolean; // interface simple : accueil réduit à l'essentiel, gros boutons (Paramètres › Apparence)
  iconsOnly: boolean; // icônes seules : moins de mots sur les boutons, icônes plus grandes (pour qui lit peu)
  festiveOff: boolean; // décorations des fêtes coupées sur cet appareil (quand l'admin les a allumées)
  textSize: 'normal' | 'large' | 'xlarge'; // taille du texte et des boutons (Paramètres › Apparence)
  reduceMotion: boolean; // moins d'animations (Paramètres › Apparence)
  hideAmounts: boolean; // l'œil masque aussi les montants des opérations, pas seulement le solde
  homeOrder: string[]; // accueil : ordre des cartes (Paramètres › Accueil)
  homeHidden: string[]; // accueil : cartes cachées
}

export const DEFAULT_PREFS: DisplayPrefs = { number: 'fr', decimals: 'always', date: 'dmy', weekStart: 1, monthStart: 1, yearStart: 0, excludeOption: false, hideBalance: false, homeWalletCard: false, simpleMode: false, iconsOnly: false, festiveOff: false, textSize: 'normal', reduceMotion: false, hideAmounts: false, homeOrder: [], homeHidden: ['wallet', 'rates', 'due', 'health', 'badges', 'subs', 'budgets', 'goals'] }; // par défaut : seulement le résumé du mois et les dernières opérations

export const NUMBER_LOCALES: Record<DisplayPrefs['number'], string> = { fr: 'fr-FR', en: 'en-US', de: 'de-DE', ch: 'de-CH' };

const KEY = 'ap.display';
let prefs: DisplayPrefs = read();
const listeners = new Set<() => void>();

function read(): DisplayPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

onOtherTabChange(KEY, () => {
  prefs = read();
  applyDom();
  listeners.forEach((l) => l());
});

// Taille du texte et animations : appliquées sur la page (voir index.css)
function applyDom() {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (prefs.textSize === 'normal') delete el.dataset.text;
  else el.dataset.text = prefs.textSize;
  if (prefs.reduceMotion) el.dataset.calm = '1';
  else delete el.dataset.calm;
}
applyDom();

export const getPrefs = () => prefs;

export function setPrefs(changes: Partial<DisplayPrefs>) {
  prefs = { ...prefs, ...changes };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // réglage gardé pour cette session
  }
  applyDom();
  // Solde masqué et taille du texte : propres à cet appareil, pas envoyés au compte
  if (Object.keys(changes).some((k) => k !== 'hideBalance' && k !== 'textSize')) markPrefsChanged();
  listeners.forEach((l) => l());
}

export function useDisplayPrefs(): DisplayPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

// Date en chiffres selon la préférence ; short = sans l'année (29/09)
export function formatDate(d: Date, short = false, style: DisplayPrefs['date'] = prefs.date): string {
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  switch (style) {
    case 'mdy':
      return short ? `${mm}/${dd}` : `${mm}/${dd}/${yyyy}`;
    case 'ymd':
      return short ? `${mm}-${dd}` : `${yyyy}-${mm}-${dd}`;
    default:
      return short ? `${dd}/${mm}` : `${dd}/${mm}/${yyyy}`;
  }
}
