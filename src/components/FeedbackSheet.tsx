import React, { useState } from 'react';
import { X, Frown, Annoyed, Meh, Smile, Laugh, Lightbulb, Bug, MessageCircle, Loader2, Check, CloudOff } from 'lucide-react';
import { FeedbackKind, sendFeedback } from '../lib/feedback';
import { haptic } from '../lib/haptics';

// « Donner mon avis » : humeur, type, message. Envoyé tout de suite, ou dès que le réseau revient.

const MOODS = [
  { v: 1, Icon: Frown, label: 'Pas content', color: '#EF4444' },
  { v: 2, Icon: Annoyed, label: 'Bof', color: '#F97316' },
  { v: 3, Icon: Meh, label: 'Moyen', color: '#F59E0B' },
  { v: 4, Icon: Smile, label: 'Content', color: '#22C55E' },
  { v: 5, Icon: Laugh, label: 'Très content', color: '#10B981' },
];
const KINDS: { id: FeedbackKind; label: string; Icon: typeof Bug; hint: string }[] = [
  { id: 'idea', label: 'Idée', Icon: Lightbulb, hint: 'Une fonction qui te manque, une amélioration…' },
  { id: 'problem', label: 'Problème', Icon: Bug, hint: 'Dis ce que tu faisais et ce qui ne marchait pas.' },
  { id: 'other', label: 'Autre', Icon: MessageCircle, hint: 'Tout ce que tu veux nous dire.' },
];

export const FeedbackSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [mood, setMood] = useState<number | null>(null);
  const [kind, setKind] = useState<FeedbackKind>('idea');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'queued'>('idle');
  const k = KINDS.find((x) => x.id === kind)!;

  const send = async () => {
    setState('sending');
    const ok = await sendFeedback({ mood, kind, message: message.trim() });
    haptic('success');
    setState(ok ? 'sent' : 'queued');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Donner mon avis"
        className="w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head flex items-center justify-between mb-2">
          <h2 className="text-[22px] font-bold tracking-tight text-slate-900">Donner mon avis</h2>
          <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {state === 'sent' || state === 'queued' ? (
          // Merci !
          <div className="flex flex-col items-center text-center py-8 animate-fade-in">
            <span className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 cloud-pop ${state === 'sent' ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
              {state === 'sent' ? <Check className="w-10 h-10 text-emerald-500" strokeWidth={2.5} /> : <CloudOff className="w-10 h-10 text-amber-500" />}
            </span>
            <h3 className="text-[20px] font-bold text-slate-900">Merci beaucoup !</h3>
            <p className="text-[14px] text-slate-500 mt-1 max-w-[280px] leading-snug">
              {state === 'sent' ? 'Ton avis est bien arrivé. Il nous aide à rendre Wallo meilleur.' : 'Pas de connexion : ton avis est gardé et partira tout seul dès que le réseau revient.'}
            </p>
            <button onClick={onClose} className="mt-6 w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold cursor-pointer transition active:scale-[0.98]">
              Fermer
            </button>
          </div>
        ) : (
          <>
            <p className="text-[14px] text-slate-500 mb-5">Ton avis est lu par l'équipe de Wallo.</p>

            {/* Humeur */}
            <div className="text-[13px] font-semibold text-slate-700 mb-2">Comment trouves-tu Wallo ?</div>
            <div className="grid grid-cols-5 gap-1.5 mb-5">
              {MOODS.map((m) => {
                const on = mood === m.v;
                return (
                  <button
                    key={m.v}
                    type="button"
                    onClick={() => {
                      haptic();
                      setMood(m.v);
                    }}
                    aria-pressed={on}
                    aria-label={m.label}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl cursor-pointer transition duration-200 active:scale-95 ${on ? '' : 'bg-slate-100'}`}
                    style={on ? { background: `${m.color}22` } : undefined}
                  >
                    <m.Icon className={`w-7 h-7 transition-transform duration-200 ${on ? 'scale-110' : ''}`} style={{ color: on ? m.color : '#94A3B8' }} strokeWidth={on ? 2.3 : 1.8} />
                    <span className="text-[10px] font-semibold leading-tight text-center" style={{ color: on ? m.color : '#94A3B8' }}>
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Type */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/60 mb-2">
              {KINDS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setKind(x.id)}
                  className={`h-9 rounded-[10px] text-[13px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${kind === x.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  <x.Icon className="w-4 h-4" /> {x.label}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-slate-400 px-1 mb-2">{k.hint}</p>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="Écris ton message ici…"
              className="w-full px-4 py-3 rounded-2xl bg-slate-100 text-[15px] leading-snug outline-none focus:ring-2 focus:ring-accent resize-none"
            />
            <div className="text-right text-[11px] text-slate-400 tabular-nums mb-4">{message.length} / 2000</div>

            <button
              onClick={send}
              disabled={!message.trim() || state === 'sending'}
              className="w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover disabled:opacity-40 text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
            >
              {state === 'sending' && <Loader2 className="w-4 h-4 animate-spin" />}
              {state === 'sending' ? 'Envoi…' : "Envoyer mon avis"}
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-2">Le modèle de ton téléphone est joint pour nous aider à corriger les problèmes.</p>
          </>
        )}
      </div>
    </div>
  );
};
