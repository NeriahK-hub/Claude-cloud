// Retour haptique (petite vibration au toucher).
// • Android (et autres) : navigator.vibrate.
// • iPhone : Safari n'a pas d'API de vibration. Depuis iOS 18, basculer un interrupteur système
//   (<input type="checkbox" switch>) produit le « tic » d'iOS : on en crée un invisible, on le
//   bascule, on l'enlève. À appeler DANS le gestionnaire du toucher (sinon iOS ne fait rien).
// Désactivable dans Paramètres › Apparence.

const KEY = 'ap.haptics';
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();

export const hapticsEnabled = () => enabled;
export function setHapticsEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // réglage gardé pour cette session
  }
  if (on) haptic('success'); // on sent tout de suite que c'est activé
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
const VIBRATE: Record<Kind, number | number[]> = { light: 8, success: [10, 70, 14], warning: [14, 60, 14, 60, 14] };

export function haptic(kind: Kind = 'light') {
  if (!enabled || typeof window === 'undefined') return;
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
