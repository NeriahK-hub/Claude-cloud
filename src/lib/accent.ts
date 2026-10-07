import { useSyncExternalStore } from 'react';
import { onOtherTabChange } from './crossTab';
import { markPrefsChanged } from './prefsStamp';

// Couleur d'accent de l'app (boutons principaux, sélection, onglet actif…), au choix dans
// Paramètres › Apparence. Elle passe par des variables CSS (--accent, --on-accent…, voir index.css) :
// les classes Tailwind bg-accent, text-on-accent, ring-accent… les lisent.
// Le texte posé sur l'accent (foncé ou blanc) est choisi tout seul pour rester lisible.

export interface Accent {
  id: string;
  name: string;
  hex: string;
}

export const ACCENTS: Accent[] = [
  { id: 'citron', name: 'Citron', hex: '#D8FB52' },
  { id: 'violet', name: 'Violet Wallo', hex: '#7B5CFF' },
  { id: 'lavande', name: 'Lavande', hex: '#A18CFF' },
  { id: 'menthe', name: 'Menthe', hex: '#2ED3A0' },
  { id: 'corail', name: 'Corail', hex: '#FF6B6B' },
  { id: 'ciel', name: 'Ciel', hex: '#38BDF8' },
  { id: 'mangue', name: 'Mangue', hex: '#FBBF24' },
  { id: 'rose', name: 'Rose', hex: '#F472B6' },
];

const KEY = 'ap.accent'; // { id, vars } : index.html applique `vars` avant le chargement de l'app
const DARK_TEXT = '#0d1015';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (hex: string, to: number, amount: number) => toHex(rgb(hex).map((v) => v + (to - v) * amount));
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Texte blanc dès qu'il est bien lisible (contraste ≥ 4, comme sur le violet de la charte),
// sinon foncé (citron, menthe, lavande…)
const onAccent = (hex: string) => (1.05 / (luminance(hex) + 0.05) >= 4 ? '#ffffff' : DARK_TEXT);

export function accentVars(hex: string): Record<string, string> {
  return {
    '--accent': hex,
    '--accent-hover': mix(hex, 0, 0.08), // un peu plus foncé au survol
    '--on-accent': onAccent(hex),
    '--accent-rgb': rgb(hex).join(' '),
    '--accent-deep': mix(hex, 0, 0.35), // liseré de sélection sur fond clair
  };
}

function read(): Accent {
  try {
    const id = JSON.parse(localStorage.getItem(KEY) ?? 'null')?.id;
    return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
  } catch {
    return ACCENTS[0];
  }
}

let current = read();
const listeners = new Set<() => void>();

function apply() {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(accentVars(current.hex))) root.setProperty(k, v);
}

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id: current.id, vars: accentVars(current.hex) }));
  } catch {
    // stockage bloqué : la couleur s'applique pour cette session
  }
};

export function setAccent(id: string) {
  current = ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
  save();
  markPrefsChanged();
  apply();
  listeners.forEach((l) => l());
}

onOtherTabChange(KEY, () => {
  current = read();
  apply();
  listeners.forEach((l) => l());
});

// Au démarrage : applique la couleur, et remet à jour ce que lit index.html (si les calculs ont changé)
export function initAccent() {
  apply();
  if (current.id !== ACCENTS[0].id) save();
}

export const getAccentId = () => current.id;

export function useAccent(): Accent {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current
  );
}
