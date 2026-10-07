// Retour haptique (petite vibration au toucher).
// • Android (et autres) : navigator.vibrate.
// • iPhone : Safari n'a pas d'API de vibration. Depuis iOS 18, basculer un interrupteur système
//   (<input type="checkbox" switch>) produit le « tic » d'iOS : on en crée un invisible, on le
//   bascule, on l'enlève. À appeler DANS le gestionnaire du toucher (sinon iOS ne fait rien).
// • Tous les boutons « tiquent » tout seuls (installTapHaptics) ; haptic() sert en plus pour les
//   gestes sans bouton (glisser, etc.) ou pour un retour plus marqué ('success', 'warning').
// Désactivable dans Paramètres › Apparence.

import { onOtherTabChange } from './crossTab';
import { applyingRemote, markPrefsChanged } from './prefsStamp';

const KEY = 'ap.haptics';
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();

onOtherTabChange(KEY, () => {
  try {
    enabled = localStorage.getItem(KEY) !== 'off';
  } catch {
    // on garde la valeur actuelle
  }
});

export const hapticsEnabled = () => enabled;
export function setHapticsEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // réglage gardé pour cette session
  }
  markPrefsChanged();
  if (on && !applyingRemote()) haptic('success'); // on sent tout de suite que c'est activé
}

const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function iosTick() {
  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

type Kind = 'light' | 'success' | 'warning';
const PATTERNS: Record<Kind, number[]> = { light: [0], success: [0, 110], warning: [0, 90, 180] };
// Beaucoup d'Android ignorent les vibrations de moins de ~15 ms
const VIBRATE: Record<Kind, number | number[]> = { light: 15, success: [15, 60, 20], warning: [20, 60, 20, 60, 20] };

let last = 0;

export function haptic(kind: Kind = 'light') {
  if (!enabled || typeof window === 'undefined') return;
  // Un seul petit « tic » par toucher : le bouton et l'écouteur global peuvent le demander tous les deux
  const now = Date.now();
  if (kind === 'light' && now - last < 60) return;
  last = now;
  try {
    if (!isIOS && navigator.vibrate) {
      navigator.vibrate(VIBRATE[kind]);
      return;
    }
    if (isIOS) PATTERNS[kind].forEach((ms) => (ms ? setTimeout(iosTick, ms) : iosTick()));
  } catch {
    // pas de vibration possible : on ne dit rien
  }
}

// Ce qu'on peut toucher : un « tic » à chaque appui, sans avoir à appeler haptic() partout
const TAPPABLE =
  'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="option"], [role="menuitem"], label, summary, select, input[type="checkbox"], input[type="radio"]';

export function installTapHaptics() {
  // Phase de remontée : le gestionnaire du bouton passe d'abord (s'il a demandé 'success', pas de tic en plus)
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return; // ignore les clics simulés (dont celui de iosTick)
    const el = (e.target as Element | null)?.closest?.(TAPPABLE);
    if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    haptic();
  });
}
