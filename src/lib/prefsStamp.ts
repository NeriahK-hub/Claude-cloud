// Date du dernier changement de réglage de l'appareil (affichage, thème, couleur, vibrations).
// Sert à savoir, avec un compte en ligne, qui a la version la plus récente : ce téléphone ou le compte.
// Fichier à part pour éviter des imports en boucle (display, theme, accent, haptics l'appellent).

const KEY = 'ap.prefs.at';
const listeners = new Set<() => void>();
let silent = false; // réglages reçus du compte : pas un changement fait ici

export function prefsChangedAt(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setPrefsChangedAt(at: number) {
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    // stockage bloqué : on renverra peut-être les réglages une fois de trop
  }
}

export const applyingRemote = () => silent;

export function markPrefsChanged() {
  if (silent) return;
  setPrefsChangedAt(Date.now());
  listeners.forEach((l) => l());
}

export function onPrefsChanged(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// Applique des réglages sans les considérer comme un changement fait ici
export function withoutStamp(fn: () => void) {
  silent = true;
  try {
    fn();
  } finally {
    silent = false;
  }
}
