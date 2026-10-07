import React, { useEffect, useState } from 'react';
import { cloudConfigured } from '../lib/config';

// Écran d'accueil animé : à l'ouverture de Wallo tant qu'on n'est pas connecté à un compte,
// et juste après une déconnexion (voir App.tsx). Connecté : on ne le voit plus.
// L'app se charge derrière pendant ce temps. Un toucher le fait passer.
// Couleurs fixes (violet Wallo) : identiques en mode clair et sombre.

const KEY = 'ap.welcomed';
const DURATION = 3200; // ms avant le fondu de sortie

// Session Supabase gardée sur l'appareil (clé « sb-<projet>-auth-token ») : lu tout de suite, sans réseau
function signedIn(): boolean {
  return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k) && !!localStorage.getItem(k));
}

export function shouldShowSplash(): boolean {
  try {
    // Retour d'une connexion (Google, lien de l'e-mail) : la session arrive, pas d'écran d'accueil
    if (/[?&#](code|access_token)=/.test(window.location.href)) return false;
    if (cloudConfigured) return !signedIn();
    // Sans comptes en ligne : seulement à la toute première ouverture
    if (localStorage.getItem(KEY) === '1') return false;
    // Déjà des données sur ce téléphone (utilisé avant cette mise à jour) : pas une première ouverture
    if (localStorage.getItem('ap.wallets') !== null || localStorage.getItem('ap.transactions') !== null) {
      markSeen();
      return false;
    }
    return true;
  } catch {
    return false; // stockage bloqué : sinon il reviendrait à chaque ouverture
  }
}

const markSeen = () => {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // rien
  }
};

const LETTERS = 'Wallo'.split('');

export const Splash: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [leaving, setLeaving] = useState(false);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const leave = () => {
    if (leaving) return;
    markSeen();
    setLeaving(true);
    setTimeout(onDone, 450);
  };

  useEffect(() => {
    markSeen(); // même si on ferme l'app pendant l'animation, elle ne revient pas
    const t = setTimeout(leave, reduce ? 1400 : DURATION);
    // (la page derrière est figée par installScrollLock, src/lib/scrollLock.ts)
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={leave}
      role="presentation"
      className={`splash fixed inset-0 z-[100] overflow-hidden flex flex-col items-center justify-center select-none ${leaving ? 'splash-out' : ''}`}
      style={{ background: 'radial-gradient(120% 90% at 50% 0%, #7B5CFF 0%, #4B2BD6 45%, #1C0F5E 100%)' }}
    >
      {/* Halos lumineux qui dérivent lentement */}
      <span className="splash-blob" style={{ width: 360, height: 360, top: '-8%', left: '-25%', background: '#A07BFA' }} />
      <span className="splash-blob splash-blob-2" style={{ width: 300, height: 300, bottom: '-6%', right: '-20%', background: '#C084FC' }} />
      <span className="splash-blob splash-blob-3" style={{ width: 220, height: 220, top: '38%', right: '-12%', background: '#6F4BF2' }} />

      {/* Pastilles de devises qui flottent autour du logo */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {/* Loin du nom et du slogan (au milieu) : en haut et en bas de l'écran */}
        <span className="splash-coin" style={{ top: '18%', left: '12%', animationDelay: '0.9s' }}>$</span>
        <span className="splash-coin splash-coin-sm" style={{ top: '24%', right: '13%', animationDelay: '1.1s' }}>FC</span>
        <span className="splash-coin splash-coin-sm" style={{ bottom: '22%', left: '16%', animationDelay: '1.3s' }}>$</span>
        <span className="splash-coin" style={{ bottom: '17%', right: '14%', animationDelay: '1.0s' }}>FC</span>
      </div>

      {/* Logo */}
      <div className="relative">
        <span className="splash-ring" aria-hidden />
        <span className="splash-ring splash-ring-2" aria-hidden />
        <img src="/icons/wallo.svg" alt="" className="splash-logo relative w-28 h-28 rounded-[30px]" draggable={false} />
      </div>

      {/* Nom, lettre par lettre */}
      <h1 className="mt-7 flex text-[44px] font-extrabold tracking-tight leading-none" style={{ color: '#ffffff' }} aria-label="Wallo">
        {LETTERS.map((l, i) => (
          <span key={i} className="splash-letter" style={{ animationDelay: `${0.55 + i * 0.07}s` }} aria-hidden>
            {l}
          </span>
        ))}
      </h1>
      <p className="splash-tagline mt-3 text-[17px] font-medium" style={{ color: 'rgba(255,255,255,0.78)' }}>
        Ton argent, en clair.
      </p>

      {/* Chargement */}
      <div className="absolute bottom-[max(3.5rem,calc(env(safe-area-inset-bottom)+2.5rem))] flex flex-col items-center gap-3">
        <div className="w-36 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.18)' }}>
          <div className="splash-bar h-full rounded-full" style={{ background: '#D8FB52', animationDuration: `${reduce ? 1400 : DURATION}ms` }} />
        </div>
        <span className="splash-tagline text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Toucher pour commencer
        </span>
      </div>
    </div>
  );
};
