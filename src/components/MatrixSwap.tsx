import React, { useEffect, useRef, useState } from 'react';
import { getPrefs, useDisplayPrefs } from '../lib/display';

// Solde masqué / affiché avec un petit effet « Matrix » : des caractères verts défilent,
// puis le texte se fixe de gauche à droite. Seulement quand on touche l'œil (pas quand le
// montant change), et jamais si le téléphone demande de réduire les animations.

export const HIDDEN_AMOUNT = '••••••';
const GLYPHS = '0123456789ｱｳｴｶｷｸｺｻｼｽﾀﾁﾂﾃﾅﾆﾇﾈﾊﾋﾌﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ$#%&';
const DURATION = 560;
const noise = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

export const MatrixSwap: React.FC<{ hidden: boolean; text: string }> = ({ hidden, text }) => {
  const target = hidden ? HIDDEN_AMOUNT : text;
  const [frame, setFrame] = useState<{ fixed: string; rain: string } | null>(null);
  const first = useRef(true);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (getPrefs().reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const goal = targetRef.current;
    const len = Math.max(goal.length, HIDDEN_AMOUNT.length);
    const start = performance.now();
    // Nouveaux caractères toutes les 45 ms ; la fin est garantie par le minuteur final
    // (même si l'app passe en arrière-plan au milieu de l'effet)
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / DURATION);
      const settled = Math.floor(p * p * len); // lent au début, puis tout se fixe
      setFrame({ fixed: goal.slice(0, settled), rain: Array.from({ length: len - settled }, noise).join('') });
    };
    step();
    const timer = setInterval(step, 45);
    const end = setTimeout(() => {
      clearInterval(timer);
      setFrame(null);
    }, DURATION);
    return () => {
      clearInterval(timer);
      clearTimeout(end);
      setFrame(null);
    };
  }, [hidden]);

  if (!frame) return <>{target}</>;
  return (
    <span aria-label={target}>
      {frame.fixed}
      <span aria-hidden className="text-emerald-500 [text-shadow:0_0_8px_rgb(34_197_94/0.7)]">
        {frame.rain}
      </span>
    </span>
  );
};

// Un montant qui suit le bouton œil (Masquer / Afficher) : à utiliser partout où un solde est écrit
export const SecretMoney: React.FC<{ text: string }> = ({ text }) => {
  const { hideBalance } = useDisplayPrefs();
  return <MatrixSwap hidden={hideBalance} text={text} />;
};

// Montant d'une opération : masqué par l'œil seulement si « Masquer aussi les montants des opérations » est coché
export const SecretAmount: React.FC<{ text: string }> = ({ text }) => {
  const { hideBalance, hideAmounts } = useDisplayPrefs();
  return <MatrixSwap hidden={hideBalance && hideAmounts} text={text} />;
};
