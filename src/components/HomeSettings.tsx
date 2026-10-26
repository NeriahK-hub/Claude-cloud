import React from 'react';
import { ChevronUp, ChevronDown, GripVertical, RotateCcw } from 'lucide-react';
import { SortableList } from './SortableList';
import { DEFAULT_PREFS, setPrefs, useDisplayPrefs } from '../lib/display';
import { fullOrder, HOME_CARDS, HomeCardId } from '../lib/homeLayout';
import { haptic } from '../lib/haptics';

// Paramètres › Accueil : on choisit ce qui s'affiche sur l'écran d'accueil, et dans quel ordre.
export const HomeSettings: React.FC = () => {
  const { homeOrder, homeHidden } = useDisplayPrefs();
  const order = fullOrder(homeOrder);
  const info = (id: string) => HOME_CARDS.find((c) => c.id === id)!;

  const toggle = (id: string, on: boolean) => {
    haptic();
    setPrefs({ homeHidden: on ? homeHidden.filter((x) => x !== id) : [...homeHidden, id] });
  };
  const changed = homeOrder.length > 0 || homeHidden.join() !== DEFAULT_PREFS.homeHidden.join();

  return (
    <>
      <p className="text-[12px] text-slate-500 px-1 mb-2.5 leading-snug">Maintiens une carte et fais-la glisser, ou utilise les flèches.</p>
      <SortableList
        items={order}
        getId={(id) => id}
        onChange={(ids) => {
          haptic();
          setPrefs({ homeOrder: ids as HomeCardId[] });
        }}
        renderItem={(id, { index, dragging, move }) => {
          const on = !homeHidden.includes(id);
          return (
            <div className={`bg-white rounded-2xl border p-2.5 pl-2 flex items-center gap-2 transition-shadow ${dragging ? 'shadow-xl border-slate-300 scale-[1.02]' : 'border-slate-100'}`}>
              <GripVertical className="w-5 h-5 text-slate-400 shrink-0" aria-hidden />
              <span className="flex-1 min-w-0">
                <span className={`block text-[15px] font-semibold ${on ? 'text-slate-900' : 'text-slate-400'}`}>{info(id).label}</span>
                <span className="block text-[12px] text-slate-500 leading-snug">{info(id).hint}</span>
              </span>
              <button
                onClick={() => move(-1)}
                disabled={index === 0}
                aria-label={`Monter ${info(id).label}`}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => move(1)}
                disabled={index === order.length - 1}
                aria-label={`Descendre ${info(id).label}`}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <input
                type="checkbox"
                role="switch"
                aria-label={`Afficher « ${info(id).label} »`}
                checked={on}
                onChange={(e) => toggle(id, e.target.checked)}
                className="toggle shrink-0 ml-0.5"
              />
            </div>
          );
        }}
      />
      <p className="text-[12px] text-slate-400 px-4 mt-1.5 leading-snug">
        Une carte cachée n’apparaît plus sur l’accueil. Le solde et les boutons d’ajout restent toujours en haut.
      </p>
      {changed && (
        <button
          onClick={() => setPrefs({ homeOrder: [], homeHidden: DEFAULT_PREFS.homeHidden })}
          className="mt-3 mx-auto flex items-center gap-1.5 h-9 px-4 rounded-full bg-slate-100 text-[13px] font-semibold text-slate-600 cursor-pointer active:scale-95 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Remettre comme avant
        </button>
      )}
    </>
  );
};
