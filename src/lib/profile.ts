import { useSyncExternalStore } from 'react';

// Profil de la personne qui utilise l'app (pour l'instant : juste son nom, sur cet appareil).
// Avec les comptes en ligne, il viendra de la base.
export interface Profile {
  name: string;
}

const KEY = 'ap.profile';
let profile: Profile = read();
const listeners = new Set<() => void>();

function read(): Profile {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { name: typeof v.name === 'string' ? v.name : '' };
  } catch {
    return { name: '' };
  }
}

export function setProfileName(name: string) {
  profile = { ...profile, name };
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // stockage plein ou bloqué : le nom reste pour cette session
  }
  listeners.forEach((l) => l());
}

export function useProfile(): Profile {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => profile
  );
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
