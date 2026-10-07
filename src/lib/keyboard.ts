// Clavier ouvert (surtout iPhone) : Safari le pose PAR-DESSUS la page au lieu de la raccourcir,
// et cache les fenêtres du bas (« Ajuster le solde », formulaires…).
// On suit la partie encore visible de l'écran (visualViewport) : les fenêtres de l'app
// (« fixed inset-0 z-50 », voir index.css) s'y placent, donc juste au-dessus du clavier,
// et le champ touché est ramené au milieu de la fenêtre.

export function installKeyboardFit() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;

  const update = () => {
    frame = 0;
    // Clavier fermé (ou presque) : on rend la main au CSS normal
    const hidden = window.innerHeight - vv.height < 80;
    if (hidden) {
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
      root.classList.remove('keyboard-open');
      return;
    }
    root.style.setProperty('--vv-top', `${Math.max(0, vv.offsetTop)}px`);
    root.style.setProperty('--vv-height', `${vv.height}px`);
    root.classList.add('keyboard-open');
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);

  // Champ touché dans une fenêtre : visible une fois le clavier ouvert
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || !el.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (!el.closest('.fixed.inset-0.z-50')) return;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  });
}
