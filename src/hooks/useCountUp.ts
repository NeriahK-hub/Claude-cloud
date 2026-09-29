import { useEffect, useRef, useState } from 'react';

// Le nombre glisse de l'ancienne valeur à la nouvelle (ex. solde après un ajout ou un changement
// de portefeuille). Une seule mise à jour de texte par image : léger même sur un petit téléphone.
// Pas d'animation au premier affichage, ni si l'utilisateur a demandé moins d'animations.
export function useCountUp(target: number, duration = 450): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (from === target || reduce) {
      current.current = target;
      setShown(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      current.current = p === 1 ? target : from + (target - from) * eased;
      setShown(current.current);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return shown;
}
