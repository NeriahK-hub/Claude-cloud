import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { track } from '../lib/usage';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { haptic } from '../lib/haptics';

// Bulles d'aide pour les premières fois : une bulle pointe un élément de l'écran (repéré par
// data-coach="…"), l'éclaire, explique en une phrase. « Suivant » passe à la bulle d'après,
// la croix ferme tout le parcours. Chaque bulle n'est montrée qu'une fois.

export interface CoachStep {
  id: string; // une fois vue, plus jamais montrée
  target: string; // valeur de data-coach
  title: string;
  text: string;
}

const KEY = 'ap.coachSeen';
const readSeen = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
};
const markSeen = (ids: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...readSeen(), ...ids])]));
  } catch {
    /* stockage indisponible */
  }
};
// Profil › Revoir les astuces
export const resetCoach = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien */
  }
};

let busy = false; // un seul parcours à la fois dans toute l'app

const find = (target: string) => [...document.querySelectorAll<HTMLElement>(`[data-coach="${target}"]`)].find((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed');
// Une fenêtre, l'écran d'accueil ou le tutoriel est ouvert : on attend
const blocked = () => !!document.querySelector('.fixed.inset-0.z-50, .fixed.inset-0.z-\\[60\\], .fixed.inset-0.z-\\[95\\], .splash');

export const CoachTour: React.FC<{ steps: CoachStep[]; delay?: number }> = ({ steps, delay = 900 }) => {
  const [list, setList] = useState<CoachStep[] | null>(null);
  const [i, setI] = useState(0);

  // Démarre quand l'écran est libre, avec les bulles pas encore vues dont la cible existe
  useEffect(() => {
    const seen = readSeen();
    const todo = steps.filter((s) => !seen.has(s.id));
    if (!todo.length) return;
    let timer = 0;
    let alive = true;
    const tryStart = () => {
      if (!alive) return;
      if (busy || blocked()) {
        timer = window.setTimeout(tryStart, 1200);
        return;
      }
      const ready = todo.filter((s) => find(s.target));
      if (!ready.length) return;
      busy = true;
      setList(ready);
      setI(0);
    };
    timer = window.setTimeout(tryStart, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (list) busy = false;
    },
    [list]
  );

  if (!list) return null;
  const step = list[i];
  const finish = (all: boolean) => {
    markSeen(all ? list.map((s) => s.id) : [step.id]);
    if (!all && i < list.length - 1) {
      haptic();
      setI(i + 1);
      return;
    }
    track(all && i < list.length - 1 ? 'coach.skip' : 'coach.done');
    busy = false;
    setList(null);
  };
  return createPortal(<Bubble key={step.id} step={step} index={i} count={list.length} onNext={() => finish(false)} onClose={() => finish(true)} />, document.body);
};

const Bubble: React.FC<{ step: CoachStep; index: number; count: number; onNext: () => void; onClose: () => void }> = ({ step, index, count, onNext, onClose }) => {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(150);

  // Amène la cible à l'écran, puis suit sa position (défilement, rotation…)
  useEffect(() => {
    const el = find(step.target);
    if (!el) return onNext();
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    let raf = 0;
    const loop = () => {
      const t = find(step.target);
      if (t) setRect(t.getBoundingClientRect());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.target]);
  useLayoutEffect(() => {
    if (box.current) setH(box.current.offsetHeight);
  }, [rect?.width, step.id]);

  if (!rect) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = Math.min(330, vw - 32);
  const cx = rect.left + rect.width / 2;
  const left = Math.max(16, Math.min(cx - W / 2, vw - W - 16));
  const below = rect.bottom + 14 + h < vh - 12 || rect.top - 14 - h < 12;
  const top = below ? rect.bottom + 14 : rect.top - 14 - h;
  const arrowX = Math.max(22, Math.min(cx - left, W - 22));
  const pad = 6;
  const radius = Math.min(28, Math.max(12, Math.min(rect.width, rect.height) / 2 + pad));

  return (
    <div className="fixed inset-0 z-[90]" onClick={onNext} data-own-leave>
      {/* Projecteur : tout s'assombrit sauf l'élément montré */}
      <div
        className="fixed pointer-events-none coach-spot"
        style={{
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          borderRadius: radius,
          boxShadow: '0 0 0 9999px rgb(8 10 14 / 0.55), 0 0 0 3px var(--accent)',
        }}
      />
      <div
        ref={box}
        role="dialog"
        aria-label={step.title}
        onClick={(e) => e.stopPropagation()}
        className={`fixed rounded-[22px] p-4 pr-3 shadow-[0_18px_50px_-10px_rgb(0_0_0/0.45)] ${below ? 'coach-in-down' : 'coach-in-up'}`}
        style={{ left, top, width: W, background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {/* Petite pointe vers l'élément */}
        <span className="absolute w-4 h-4 rotate-45 rounded-[3px]" style={{ left: arrowX - 8, [below ? 'top' : 'bottom']: -6, background: 'var(--accent)' }} />
        <div className="relative flex items-start gap-2">
          <h3 className="flex-1 text-[17px] font-bold leading-snug">{step.title}</h3>
          <button onClick={onClose} aria-label="Fermer les astuces" className="w-8 h-8 -mt-1 rounded-full flex items-center justify-center shrink-0 cursor-pointer" style={{ background: 'rgb(0 0 0 / 0.08)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="relative text-[15px] leading-snug mt-1 pr-1" style={{ opacity: 0.9 }}>
          {step.text}
        </p>
        <div className="relative flex items-center justify-between mt-3.5">
          <span className="text-[13px] font-semibold tabular-nums" style={{ opacity: 0.7 }}>
            {count > 1 ? `${index + 1} / ${count}` : ''}
          </span>
          <button
            onClick={onNext}
            className="h-10 px-5 rounded-full text-[15px] font-bold cursor-pointer active:scale-95 transition"
            style={{ background: 'rgb(255 255 255 / 0.95)', color: '#0d1015' }}
          >
            {index < count - 1 ? 'Suivant' : 'Compris'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------- Les parcours ----------
export const HOME_TIPS: CoachStep[] = [
  { id: 'home-add', target: 'add', title: 'Note ta première opération', text: 'Touche + pour ajouter une dépense ou un revenu. Ça prend 10 secondes.' },
  { id: 'home-wallet', target: 'wallet', title: 'Tes portefeuilles', text: 'Cash, M-Pesa, banque… Touche ici pour en choisir un, ou voir le total de tout.' },
  { id: 'home-eye', target: 'eye', title: 'Cache ton solde', text: 'Quelqu’un regarde ton téléphone ? Touche ici pour masquer tes montants.' },
  { id: 'home-health', target: 'health', title: 'Ta santé financière', text: 'Une note sur 100 et un conseil chaque semaine. Touche pour voir le détail.' },
  { id: 'home-badges', target: 'badges', title: 'Ta série et tes badges', text: 'Note au moins une opération par jour : ta flamme grandit et tu gagnes des badges.' },
  { id: 'home-menu', target: 'menu', title: 'Tout le reste est ici', text: 'Budgets, dettes, factures, scanner un code QR, paramètres…' },
];
export const SIMPLE_TIPS: CoachStep[] = [
  { id: 'simple-actions', target: 'simple-actions', title: 'Deux boutons, c’est tout', text: 'Rouge quand l’argent sort, vert quand il entre. Touche, tape le montant, c’est noté.' },
  { id: 'home-wallet', target: 'wallet', title: 'Tes portefeuilles', text: 'Cash, M-Pesa, banque… Touche ici pour en choisir un, ou voir le total de tout.' },
  { id: 'home-eye', target: 'eye', title: 'Cache ton solde', text: 'Quelqu’un regarde ton téléphone ? Touche ici pour masquer tes montants.' },
  { id: 'home-menu', target: 'menu', title: 'Tout le reste est ici', text: 'Factures, dettes, paramètres… et « Voir toute l’app » en bas de l’accueil.' },
];
export const REPORT_TIPS: CoachStep[] = [
  { id: 'report-insights', target: 'insights', title: 'Comprends ton argent', text: 'Bilan de la semaine et de l’année, tes habitudes : ce que tu achètes souvent, ton jour le plus cher et tes petites dépenses.' },
];
export const WALLET_TIPS: CoachStep[] = [
  { id: 'wallets-new', target: 'new-wallet', title: 'Un portefeuille par endroit', text: 'Ajoute ton cash, ton compte M-Pesa, ta banque… Wallo fait le total pour toi.' },
];
export const GOAL_TIPS: CoachStep[] = [
  { id: 'goals-new', target: 'new-goal', title: 'Ton premier objectif', text: 'Une moto, un loyer, un mariage… Wallo te dit combien mettre de côté chaque jour.' },
];
