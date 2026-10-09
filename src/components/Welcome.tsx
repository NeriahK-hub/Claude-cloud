import React, { useEffect, useRef, useState } from 'react';
import { CloudOff, Mail } from 'lucide-react';
import { Cloud } from '../lib/sync/useCloud';
import { cloudConfigured } from '../lib/config';
import { LoginSheet } from './Account';
import { useIsDesktop } from '../hooks/useIsDesktop';

// Page de bienvenue / connexion : après l'écran animé, tant qu'on n'est pas connecté.
// « Se connecter » ouvre la connexion (code par e-mail ou Google, le compte est créé au besoin) ;
// « Continuer sans compte » garde tout sur ce téléphone (on peut se connecter plus tard dans Profil).
// Les cartes gardent le violet Wallo en clair comme en sombre ; le reste suit le thème.

const KEY = 'ap.welcomeSkip';

export function shouldShowWelcome(signedIn: boolean): boolean {
  try {
    if (!cloudConfigured || signedIn) return false;
    if (/[?&#](code|access_token)=/.test(window.location.href)) return false; // retour d'une connexion
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return false;
  }
}

export const resetWelcome = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien
  }
};

const card = (from: string, to: string): React.CSSProperties => ({ background: `linear-gradient(135deg, ${from}, ${to})` });

const Mark: React.FC = () => (
  <span className="absolute top-3.5 left-4 w-6 h-6 rounded-lg flex items-center justify-center text-[13px] font-extrabold" style={{ background: 'rgba(255,255,255,0.25)', color: '#fff' }}>W</span>
);

// 1. Les portefeuilles : deux cartes qui se chevauchent, avec deux pièces
const CardsArt: React.FC = () => (
  <div className="relative w-[260px] h-[230px] scale-110" aria-hidden>
    <div className="absolute left-0 top-[96px] w-[190px] h-[116px] rounded-[22px] -rotate-[12deg] shadow-xl" style={card('#B79BFF', '#8B5CF6')}>
      <Mark />
      <span className="absolute bottom-3.5 left-4 text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>Orange Money</span>
      <span className="absolute bottom-7 left-4 text-[17px] font-extrabold tabular-nums" style={{ color: '#fff' }}>FC 1 250 000</span>
    </div>
    <div className="absolute right-0 top-[26px] w-[210px] h-[128px] rounded-[22px] rotate-[8deg] shadow-2xl" style={card('#6F4BF2', '#3B1FB8')}>
      <Mark />
      <span className="absolute bottom-3.5 left-4 text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Total</span>
      <span className="absolute bottom-7 left-4 text-[20px] font-extrabold tabular-nums" style={{ color: '#fff' }}>$ 24 597,36</span>
    </div>
    <span className="welcome-coin absolute top-[-6px] left-[150px] w-12 h-12 rounded-full bg-slate-100 border border-slate-200 shadow-lg flex items-center justify-center text-[18px] font-extrabold text-slate-700">$</span>
    <span className="welcome-coin welcome-coin-2 absolute top-[120px] right-[-4px] w-10 h-10 rounded-full bg-slate-100 border border-slate-200 shadow-lg flex items-center justify-center text-[13px] font-extrabold text-slate-700">FC</span>
  </div>
);

// 2. Les budgets : trois barres qui se remplissent
const BudgetArt: React.FC = () => (
  <div className="w-[250px] rounded-[26px] bg-white border border-slate-100 shadow-xl p-4 space-y-3.5" aria-hidden>
    {[
      ['Transport', 38, '#6F4BF2'],
      ['Internet', 82, '#F59E0B'],
      ['Courses', 55, '#10B981'],
    ].map(([name, pct, color]) => (
      <div key={String(name)}>
        <div className="flex justify-between text-[12px] font-semibold text-slate-600 mb-1.5">
          <span>{name}</span>
          <span className="tabular-nums text-slate-400">{pct} %</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: String(color) }} />
        </div>
      </div>
    ))}
  </div>
);

// 3. Hors ligne : le téléphone garde tout
const OfflineArt: React.FC = () => (
  <div className="relative w-[200px] h-[200px] flex items-center justify-center" aria-hidden>
    <span className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(111,75,242,0.22), transparent)' }} />
    <div className="relative w-28 h-28 rounded-[30px] shadow-2xl flex items-center justify-center" style={card('#7B5CFF', '#3B1FB8')}>
      <CloudOff className="w-12 h-12" color="#fff" strokeWidth={1.8} />
    </div>
  </div>
);

const SLIDES = [
  { art: <CardsArt />, title: 'Tout ton argent,\nen un seul endroit', text: 'Dollars, francs congolais, Orange Money, Airtel…' },
  { art: <BudgetArt />, title: 'Sache où va\nton argent', text: 'Budgets, dettes, abonnements : Wallo te prévient avant que ça déborde.' },
  { art: <OfflineArt />, title: 'Marche aussi\nsans internet', text: 'Tout reste sur ton téléphone. Connecte-toi pour le retrouver partout.' },
];

export const Welcome: React.FC<{ cloud: Cloud; onDone: () => void }> = ({ cloud, onDone }) => {
  const [index, setIndex] = useState(0);
  const [login, setLogin] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktop();

  // Ordinateur : les écrans défilent tout seuls (sauf pendant la connexion) ; les points se touchent
  useEffect(() => {
    if (!desktop || login) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, [desktop, login, index]);

  const skip = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // rien
    }
    onDone();
  };

  if (desktop) {
    const sl = SLIDES[index];
    return (
      <div className="welcome fixed inset-0 z-[45] overflow-y-auto animate-fade-in">
        <div className="absolute inset-0 -z-20 bg-white" />
        <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(70% 60% at 75% 40%, rgba(139,92,246,0.16), rgba(139,92,246,0) 70%)' }} />
        <div className="min-h-full flex items-center justify-center px-10 py-10">
          <div className="w-full max-w-[1040px] grid grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-3 mb-14">
                <img src="/icons/wallo.svg" alt="" className="w-11 h-11 rounded-xl" />
                <span className="text-[22px] font-extrabold tracking-tight text-slate-900">Wallo</span>
              </div>
              <div key={index} className="animate-fade-in min-h-[190px]">
                <h1 className="text-[48px] leading-[1.05] font-extrabold tracking-tight text-slate-900 whitespace-pre-line">{sl.title}</h1>
                <p className="mt-4 text-[18px] leading-snug text-slate-500 max-w-[420px]">{sl.text}</p>
              </div>
              <div className="flex gap-2 my-8">
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    aria-label={`Écran ${i + 1}`}
                    className="h-6 flex items-center cursor-pointer"
                  >
                    <span className={`h-1.5 rounded-full transition-all ${i === index ? 'w-7 bg-slate-900' : 'w-1.5 bg-slate-300'}`} />
                  </button>
                ))}
              </div>
              <div className="max-w-[360px] space-y-2.5">
                <button
                  onClick={() => setLogin(true)}
                  className="w-full h-[54px] rounded-full bg-accent hover:bg-accent-hover text-on-accent text-[16px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
                >
                  <Mail className="w-[18px] h-[18px]" /> Se connecter
                </button>
                <button
                  onClick={skip}
                  className="w-full h-[54px] rounded-full bg-white border border-slate-300 text-slate-900 text-[16px] font-semibold cursor-pointer hover:bg-slate-50 active:scale-[0.98] transition"
                >
                  Continuer sans compte
                </button>
              </div>
            </div>
            <div className="h-[520px] rounded-[44px] flex items-center justify-center" style={{ background: 'linear-gradient(160deg, rgba(139,92,246,0.14), rgba(139,92,246,0.04))' }}>
              <div key={index} className="animate-fade-in scale-125">{sl.art}</div>
            </div>
          </div>
        </div>
        {login && <LoginSheet cloud={cloud} onClose={() => setLogin(false)} />}
      </div>
    );
  }

  return (
    <div
      className="welcome fixed inset-0 z-[45] flex flex-col pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-fade-in"
    >
      <div className="absolute inset-0 -z-20 bg-white" />
      <div className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.18) 0%, rgba(139,92,246,0) 55%)' }} />
      <div className="px-5 flex items-center gap-2.5">
        <img src="/icons/wallo.svg" alt="" className="w-9 h-9 rounded-xl" />
        <span className="text-[17px] font-extrabold tracking-tight text-slate-900">Wallo</span>
      </div>

      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SLIDES.map((s, i) => (
          <section key={i} className="w-full shrink-0 snap-center flex flex-col items-center justify-center px-8 text-center" aria-label={`${i + 1} sur ${SLIDES.length}`}>
            <div className="flex-1 min-h-0 flex items-center justify-center">{s.art}</div>
            <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-tight text-slate-900 whitespace-pre-line">{s.title}</h1>
            <p className="mt-3 text-[15px] leading-snug text-slate-500 max-w-[300px]">{s.text}</p>
          </section>
        ))}
      </div>

      <div className="flex justify-center gap-1.5 my-5" aria-hidden>
        {SLIDES.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-slate-900' : 'w-1.5 bg-slate-300'}`} />
        ))}
      </div>

      <div className="px-5 w-full max-w-sm mx-auto space-y-2.5">
        <button
          onClick={() => setLogin(true)}
          className="w-full h-[54px] rounded-full bg-accent hover:bg-accent-hover text-on-accent text-[16px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
        >
          <Mail className="w-[18px] h-[18px]" /> Se connecter
        </button>
        <button
          onClick={skip}
          className="w-full h-[54px] rounded-full bg-white border border-slate-300 text-slate-900 text-[16px] font-semibold cursor-pointer hover:bg-slate-50 active:scale-[0.98] transition"
        >
          Continuer sans compte
        </button>
      </div>

      {login && <LoginSheet cloud={cloud} onClose={() => setLogin(false)} />}
    </div>
  );
};
