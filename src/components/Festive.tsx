import React, { useMemo, useState } from 'react';
import { track } from '../lib/usage';
import { createPortal } from 'react-dom';
import { TreePine, Gift, PartyPopper, X, ChevronRight, Snowflake, Sparkles } from 'lucide-react';
import { Festive, newYearOf } from '../lib/festive';
import { useProfile } from '../lib/profile';
import { Fireworks } from './Fireworks';
import type { Page } from './BottomNav';

// Design des fêtes (allumé depuis l'espace admin) : neige à Noël, paillettes dorées au Nouvel an,
// et une carte de vœux en haut de l'accueil. Rien ne bouge si le téléphone demande moins d'animations.

// ---------- Neige / paillettes qui tombent (sur l'accueil seulement) ----------
export const FestiveLayer: React.FC<{ kind: Festive }> = ({ kind }) => {
  // Positions fixées une fois (pas de nouveau tirage à chaque affichage)
  const flakes = useMemo(
    () =>
      Array.from({ length: kind === 'christmas' ? 28 : 22 }, (_, i) => ({
        left: (i * 37 + 11) % 100,
        size: kind === 'christmas' ? 4 + ((i * 7) % 6) : 3 + ((i * 5) % 5),
        delay: -((i * 1.7) % 12),
        dur: 9 + ((i * 3) % 8),
        drift: ((i % 5) - 2) * 14,
        color: kind === 'christmas' ? 'rgb(255 255 255 / 0.85)' : ['#FDE68A', '#FACC15', '#FFFFFF', '#F59E0B'][i % 4],
        square: kind === 'newyear' && i % 3 === 0, // paillettes : quelques petits carrés
      })),
    [kind]
  );
  return createPortal(
    <div className="festive-layer fixed inset-0 z-[35] pointer-events-none overflow-hidden" aria-hidden>
      {flakes.map((f, i) => (
        <span
          key={i}
          className="festive-flake absolute -top-4"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            borderRadius: f.square ? 1 : 999,
            background: f.color,
            boxShadow: kind === 'christmas' ? '0 0 6px rgb(255 255 255 / 0.6)' : `0 0 6px ${f.color}`,
            animationDelay: `${f.delay}s`,
            animationDuration: `${f.dur}s`,
            ['--drift' as string]: `${f.drift}px`,
          }}
        />
      ))}
      {/* Nouvel an : de vrais feux d'artifice (canvas) */}
      {kind === 'newyear' && <Fireworks every={1600} className="absolute inset-0" />}
    </div>,
    document.body
  );
};

// ---------- Carte de vœux en haut de l'accueil ----------
const SEEN_KEY = 'ap.festiveCard'; // carte fermée : 'christmas-2026' / 'newyear-2027'

export const FestiveCard: React.FC<{ kind: Festive; onNavigate: (p: Page) => void }> = ({ kind, onNavigate }) => {
  const { name } = useProfile();
  const year = newYearOf();
  const id = kind === 'christmas' ? `christmas-${new Date().getFullYear()}` : `newyear-${year}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === id;
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const hide = () => {
    try {
      localStorage.setItem(SEEN_KEY, id);
    } catch {
      /* rien */
    }
    setHidden(true);
  };
  const first = name?.trim().split(/\s+/)[0];
  const xmas = kind === 'christmas';
  return (
    <div className="relative overflow-hidden rounded-3xl p-5 festive-card" style={{ background: xmas ? 'linear-gradient(135deg, #7F1D1D 0%, #B91C1C 45%, #14532D 100%)' : 'linear-gradient(135deg, #0B0B0F 0%, #1C1917 55%, #78350F 100%)' }}>
      {/* Décor : flocons ou étincelles */}
      {(xmas ? [Snowflake, Snowflake, Snowflake] : [Sparkles, Sparkles, Sparkles]).map((I, i) => (
        <I
          key={i}
          className="absolute pointer-events-none festive-twinkle"
          style={{ width: 18 + i * 8, height: 18 + i * 8, right: 14 + i * 34, top: 10 + (i % 2) * 34, color: xmas ? 'rgb(255 255 255 / 0.35)' : 'rgb(250 204 21 / 0.55)', animationDelay: `${i * 0.6}s` }}
        />
      ))}
      <button onClick={hide} aria-label="Masquer" className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer z-10" style={{ background: 'rgb(0 0 0 / 0.25)', color: '#fff' }}>
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="relative flex items-center gap-3.5">
        <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: xmas ? 'rgb(255 255 255 / 0.15)' : 'rgb(250 204 21 / 0.18)' }}>
          {xmas ? <TreePine className="w-8 h-8" style={{ color: '#BBF7D0' }} /> : <PartyPopper className="w-8 h-8" style={{ color: '#FDE047' }} />}
        </span>
        <span className="min-w-0 pr-6">
          <span className="block text-[20px] font-extrabold leading-tight" style={{ color: '#fff' }}>
            {xmas ? `Joyeux Noël${first ? `, ${first}` : ''} !` : (
              <>
                Bonne année <span style={{ color: '#FDE047', textShadow: '0 0 18px rgb(250 204 21 / 0.6)' }}>{year}</span>&nbsp;!
              </>
            )}
          </span>
          <span className="block text-[13px] leading-snug mt-1" style={{ color: 'rgb(255 255 255 / 0.85)' }}>
            {xmas
              ? 'Wallo te souhaite de belles fêtes. Un petit budget cadeaux, et janvier sera plus doux.'
              : 'Nouvelle année, nouveaux objectifs. Qu’est-ce que tu veux réaliser cette année ?'}
          </span>
        </span>
      </div>
      <button
        onClick={() => {
          track('home.festive');
          onNavigate(xmas ? 'budgets' : 'goals');
        }}
        className="relative mt-4 w-full h-11 rounded-full text-[14px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
        style={{ background: xmas ? '#fff' : '#FACC15', color: xmas ? '#7F1D1D' : '#0B0B0F' }}
      >
        {xmas ? <Gift className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        {xmas ? 'Créer mon budget des fêtes' : `Mon objectif ${year}`}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

// Petit signe à côté du titre de l'accueil
export const FestiveMark: React.FC<{ kind: Festive }> = ({ kind }) =>
  kind === 'christmas' ? <Snowflake className="w-4 h-4 festive-spin" style={{ color: '#7DD3FC' }} aria-hidden /> : <Sparkles className="w-4 h-4 festive-twinkle" style={{ color: '#FACC15' }} aria-hidden />;
