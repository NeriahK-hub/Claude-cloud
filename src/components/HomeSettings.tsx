import React from 'react';
import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { DEFAULT_PREFS, setPrefs, useDisplayPrefs } from '../lib/display';
import { fullOrder, HOME_CARDS } from '../lib/homeLayout';
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
  const move = (i: number, d: -1 | 1) => {
    haptic();
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setPrefs({ homeOrder: next });
  };
  const changed = homeOrder.length > 0 || homeHidden.join() !== DEFAULT_PREFS.homeHidden.join();

  return (
    <>
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
        {order.map((id, i) => {
          const on = !homeHidden.includes(id);
          return (
            <div key={id} className="flex items-center gap-2 pl-4 pr-2 py-2.5">
              <span className="flex-1 min-w-0">
                <span className={`block text-[15px] font-semibold ${on ? 'text-slate-900' : 'text-slate-400'}`}>{info(id).label}</span>
                <span className="block text-[12px] text-slate-500 leading-snug">{info(id).hint}</span>
              </span>
              <span className="flex flex-col shrink-0">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Monter ${info(id).label}`}
                  className="w-8 h-6 flex items-center justify-center text-slate-400 disabled:opacity-25 cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  aria-label={`Descendre ${info(id).label}`}
                  className="w-8 h-6 flex items-center justify-center text-slate-400 disabled:opacity-25 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={`Afficher « ${info(id).label} »`}
                checked={on}
                onChange={(e) => toggle(id, e.target.checked)}
                className="toggle shrink-0 mr-2"
              />
            </div>
          );
        })}
      </div>
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
