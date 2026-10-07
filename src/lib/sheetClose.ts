// Fermeture en douceur de toutes les fenêtres du bas : quand on touche le fond ou la croix « Fermer »,
// la fenêtre redescend et le fond s'éclaircit, PUIS le clic arrive au composant (qui la retire).
// Marche pour toute fenêtre de la forme : fond `fixed inset-0` + fenêtre `.animate-slide-up`.
// Une fenêtre qui gère déjà sa sortie le dit avec `data-own-leave`.

import { haptic } from './haptics';

const LEAVE_MS = 240;
let replaying = false;

// Le fond a-t-il un onClick React ? (sinon toucher le fond ne ferme rien : ne pas animer)
const hasReactClick = (el: HTMLElement) => {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  return !!key && typeof (el as unknown as Record<string, { onClick?: unknown }>)[key]?.onClick === 'function';
};

const sheetOf = (overlay: HTMLElement) => overlay.querySelector<HTMLElement>('.animate-slide-up');
const isOverlay = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.classList.contains('fixed') && el.classList.contains('inset-0') && !el.hasAttribute('data-own-leave') && !!sheetOf(el);

export function installSheetClose() {
  document.addEventListener(
    'click',
    (e) => {
      if (replaying) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      let overlay: HTMLElement | null = null;
      let trigger: HTMLElement | null = null;
      if (isOverlay(t) && hasReactClick(t)) {
        overlay = t;
        trigger = t;
      } else {
        const btn = t.closest<HTMLElement>('button[aria-label="Fermer"]');
        const o = btn?.closest('.fixed.inset-0') ?? null;
        if (btn && isOverlay(o)) {
          overlay = o;
          trigger = btn;
        }
      }
      if (!overlay || !trigger || overlay.dataset.leaving) return;
      const sheet = sheetOf(overlay)!;
      e.stopPropagation();
      e.preventDefault();
      if (trigger !== overlay) haptic(); // le « tic » du bouton (le clic rejoué plus tard n'en fait pas)
      overlay.dataset.leaving = '1';
      overlay.classList.remove('animate-fade-in');
      overlay.classList.add('animate-overlay-out');
      sheet.classList.remove('animate-slide-up');
      sheet.classList.add('animate-sheet-down');
      const o = overlay;
      const btn = trigger;
      window.setTimeout(() => {
        replaying = true;
        btn.click();
        replaying = false;
        // Toujours là (ex. une question « Abandonner ? ») : on la remet comme avant
        window.setTimeout(() => {
          if (!o.isConnected) return;
          delete o.dataset.leaving;
          o.classList.remove('animate-overlay-out');
          sheet.classList.remove('animate-sheet-down');
        }, 60);
      }, LEAVE_MS);
    },
    true,
  );
}
