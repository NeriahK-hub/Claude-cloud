import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { answerConfirm, useConfirmRequest } from '../lib/confirm';
import { haptic } from '../lib/haptics';

// Fenêtre de confirmation de toute l'app (voir src/lib/confirm.ts)
export const ConfirmHost: React.FC = () => {
  const req = useConfirmRequest();

  useEffect(() => {
    if (!req) return;
    if (req.danger) haptic('warning');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answerConfirm(false);
      if (e.key === 'Enter') answerConfirm(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-3 sm:p-4 animate-fade-in"
      onClick={() => answerConfirm(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={req.title}
        className="w-full sm:max-w-[380px] bg-white rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5 animate-slide-up text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {req.danger && (
          <span className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6" />
          </span>
        )}
        <h2 className="text-base font-bold text-slate-900">{req.title}</h2>
        {req.message && <p className="text-sm text-slate-500 mt-1.5">{req.message}</p>}
        <div className="flex flex-col gap-2 mt-5">
          <button
            onClick={() => answerConfirm(true)}
            autoFocus
            className={`w-full py-3 rounded-2xl text-sm font-bold cursor-pointer ${req.danger ? 'bg-red-600 text-white' : 'bg-accent text-slate-900'}`}
          >
            {req.confirmLabel ?? 'Confirmer'}
          </button>
          <button onClick={() => answerConfirm(false)} className="w-full py-3 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700 cursor-pointer">
            {req.cancelLabel ?? 'Annuler'}
          </button>
        </div>
      </div>
    </div>
  );
};
