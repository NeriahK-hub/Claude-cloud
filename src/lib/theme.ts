// Thème clair / sombre. « system » suit le réglage du téléphone ou de l'ordinateur.
// Le choix est gardé dans localStorage ; index.html l'applique aussi avant le chargement
// de l'app pour éviter un flash blanc.
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'ap.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function readStored(): ThemePref {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '"system"');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let current: ThemePref = readStored();

export function getThemePref(): ThemePref {
  return current;
}

function apply() {
  const pref = current;
  const dark = pref === 'dark' || (pref === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1015' : '#F4F6F5');
}

export function setThemePref(pref: ThemePref) {
  current = pref;
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {
    // stockage bloqué : le thème s'applique quand même pour cette session
  }
  apply();
}

// À appeler une fois au démarrage : applique le thème et suit les changements du système
export function initTheme() {
  apply();
  media.addEventListener('change', apply);
}
