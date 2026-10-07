// Page figée derrière les fenêtres (feuilles, menu, détail, écran d'accueil).
// `overflow: hidden` ne suffit pas sur iPhone (Safari fait quand même défiler la page au doigt) :
// on fige le <body> à sa position (position: fixed), puis on la rend à la fermeture.
// Toutes les fenêtres de l'app sont des « fixed inset-0 z-50 » (l'écran d'accueil : « .splash »).

const OPEN = '.fixed.inset-0.z-50, .splash';

export function installScrollLock() {
  if (typeof document === 'undefined') return;
  const body = document.body;
  let locked = false;
  let y = 0;
  let pending = false;

  const lock = () => {
    y = window.scrollY;
    Object.assign(body.style, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', width: '100%' });
    locked = true;
  };
  const unlock = () => {
    Object.assign(body.style, { position: '', top: '', left: '', right: '', width: '' });
    window.scrollTo(0, y);
    locked = false;
  };

  const check = () => {
    pending = false;
    const open = !!document.querySelector(OPEN);
    if (open && !locked) lock();
    else if (!open && locked) unlock();
  };

  // Une fenêtre s'ouvre ou se ferme : on vérifie (une fois par image, pas à chaque changement)
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(check);
  }).observe(body, { childList: true, subtree: true });
  check();
}
