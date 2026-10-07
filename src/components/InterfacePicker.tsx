import React from 'react';
import { Check, ArrowUpRight, ArrowDownLeft, TreePine } from 'lucide-react';
import { useFestiveAvailable } from '../lib/festive';
import { setPrefs, useDisplayPrefs } from '../lib/display';
import { haptic } from '../lib/haptics';

// Paramètres › Apparence › Interface : « Complète » ou « Simple », avec un petit dessin de chaque accueil.

const Bar: React.FC<{ w: string; h?: number; className?: string }> = ({ w, h = 4, className = 'bg-slate-200' }) => <span className={`block rounded-full ${className}`} style={{ width: w, height: h }} />;

// Aperçu de l'accueil complet : solde, 5 petits boutons, plusieurs cartes
const FullPreview = () => (
  <span className="flex flex-col items-center gap-1.5 w-full">
    <Bar w="40%" />
    <Bar w="60%" h={7} className="bg-slate-400" />
    <span className="flex gap-1 mt-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-3.5 h-3.5 rounded-[5px] ${i === 0 ? 'bg-accent' : 'bg-slate-200'}`} />
      ))}
    </span>
    {[0, 1, 2].map((i) => (
      <span key={i} className="w-full h-4 rounded-md bg-slate-100 border border-slate-200/70 flex items-center gap-1 px-1">
        <span className="w-2 h-2 rounded-full bg-slate-300" />
        <Bar w="50%" h={3} />
      </span>
    ))}
  </span>
);

// Aperçu de l'accueil simple : solde, deux gros boutons, un résumé
const SimplePreview = () => (
  <span className="flex flex-col items-center gap-1.5 w-full">
    <Bar w="40%" />
    <Bar w="60%" h={7} className="bg-slate-400" />
    <span className="grid grid-cols-2 gap-1 w-full mt-0.5">
      <span className="h-9 rounded-lg bg-white border border-slate-200/70 flex flex-col justify-between p-1">
        <span className="w-3.5 h-3.5 rounded-[4px] bg-red-500" />
        <Bar w="70%" h={3} className="bg-slate-300" />
      </span>
      <span className="h-9 rounded-lg bg-white border border-slate-200/70 flex flex-col justify-between p-1">
        <span className="w-3.5 h-3.5 rounded-[4px] bg-emerald-500" />
        <Bar w="70%" h={3} className="bg-slate-300" />
      </span>
    </span>
    <span className="w-full h-6 rounded-md bg-slate-100 border border-slate-200/70 flex flex-col justify-center gap-1 px-1">
      <Bar w="80%" h={3} className="bg-emerald-400" />
      <Bar w="65%" h={3} className="bg-red-400" />
    </span>
  </span>
);

export const InterfacePicker: React.FC = () => {
  const { simpleMode, iconsOnly, festiveOff } = useDisplayPrefs();
  const festiveAvailable = useFestiveAvailable();
  const options = [
    { simple: false, name: 'Complète', hint: 'Toutes les cartes', Preview: FullPreview },
    { simple: true, name: 'Simple', hint: 'L’essentiel, en gros', Preview: SimplePreview },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 mb-2">
        {options.map(({ simple, name, hint, Preview }) => {
          const on = simpleMode === simple;
          return (
            <button
              key={name}
              onClick={() => {
                if (on) return;
                haptic('success');
                setPrefs({ simpleMode: simple });
              }}
              aria-pressed={on}
              className="flex flex-col items-center gap-2 cursor-pointer group"
            >
              <span
                className={`relative w-full h-[118px] rounded-2xl bg-slate-50 border p-3 flex items-center transition duration-200 ${
                  on ? 'border-transparent' : 'border-slate-200 group-active:scale-[0.97]'
                }`}
                style={on ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined}
              >
                <Preview />
                {on && (
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent text-on-accent flex items-center justify-center shadow-xs animate-fade-in">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="text-center">
                <span className={`block text-[14px] ${on ? 'font-bold text-slate-900' : 'font-semibold text-slate-600'}`}>{name}</span>
                <span className="block text-[11px] text-slate-400 leading-tight">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-slate-400 mb-3 leading-snug">
        {simpleMode
          ? 'Mode simple : l’accueil montre ton solde, deux gros boutons et ton mois. Tout le reste est toujours dans le menu.'
          : 'Le mode simple est pratique pour les personnes peu à l’aise avec le téléphone.'}
      </p>
      {/* Icônes seules : pour les personnes qui lisent peu */}
      <label className="flex items-center gap-3 mb-4 p-3 rounded-2xl bg-slate-100 cursor-pointer">
        <span className="flex -space-x-1.5 shrink-0" aria-hidden>
          <span className="w-8 h-8 rounded-xl bg-red-500 flex items-center justify-center ring-2 ring-slate-100">
            <ArrowUpRight className="w-4 h-4" style={{ color: '#fff' }} strokeWidth={2.6} />
          </span>
          <span className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center ring-2 ring-slate-100">
            <ArrowDownLeft className="w-4 h-4" style={{ color: '#fff' }} strokeWidth={2.6} />
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-slate-800">Icônes seules</span>
          <span className="block text-xs text-slate-400 leading-snug">Moins de mots sur les boutons, des icônes plus grandes. Pour ceux qui lisent peu.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={iconsOnly}
          onChange={(e) => {
            haptic('success');
            setPrefs({ iconsOnly: e.target.checked });
          }}
          className="toggle shrink-0"
        />
      </label>
      {/* Décorations des fêtes : seulement quand l'espace admin les a allumées */}
      {festiveAvailable && (
        <label className="flex items-center gap-3 mb-4 p-3 rounded-2xl bg-slate-100 cursor-pointer">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #DC2626, #16A34A)' }}>
            <TreePine className="w-5 h-5" style={{ color: '#fff' }} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-slate-800">Décorations des fêtes</span>
            <span className="block text-xs text-slate-400 leading-snug">Neige à Noël, paillettes au Nouvel an, sur l&rsquo;accueil.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={!festiveOff}
            onChange={(e) => {
              haptic();
              setPrefs({ festiveOff: !e.target.checked });
            }}
            className="toggle shrink-0"
          />
        </label>
      )}
    </>
  );
};
