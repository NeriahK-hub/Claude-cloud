import React, { useEffect, useState } from 'react';
import { CloudCheck, CloudUpload, CloudOff, CloudAlert, CloudDrizzle, X, RefreshCw, User } from 'lucide-react';
import type { Cloud } from '../lib/sync/useCloud';

// Nuage de l'en-tête : une forme et une couleur par état du réseau et de la sauvegarde.
// Le toucher ouvre une petite fenêtre qui explique l'état en clair.

type NetState = 'synced' | 'syncing' | 'back' | 'slow' | 'offline' | 'waiting' | 'error' | 'local-offline';

const LOOK: Record<NetState, { Icon: typeof CloudCheck; color: string; title: string; text: string; anim?: string }> = {
  synced: { Icon: CloudCheck, color: '#10B981', title: 'Tout est sauvegardé', text: 'Tes opérations sont à jour dans ton compte en ligne.' },
  syncing: { Icon: CloudUpload, color: '#0EA5E9', title: 'Envoi en cours…', text: 'Wallo envoie tes dernières opérations dans ton compte.', anim: 'cloud-bob' },
  back: { Icon: CloudCheck, color: '#10B981', title: 'Le réseau est revenu', text: 'Tout ce que tu as noté hors ligne vient d’être envoyé.', anim: 'cloud-pop' },
  slow: { Icon: CloudDrizzle, color: '#F59E0B', title: 'Réseau faible', text: 'La connexion est lente : l’envoi peut prendre un peu de temps. Tu peux continuer normalement.' },
  offline: { Icon: CloudOff, color: '#94A3B8', title: 'Pas de connexion', text: 'Tu peux continuer à utiliser Wallo : tout est gardé sur ton téléphone.' },
  waiting: { Icon: CloudOff, color: '#F59E0B', title: 'En attente du réseau', text: 'Tes opérations sont gardées sur ton téléphone et partiront toutes seules dès que le réseau revient.' },
  error: { Icon: CloudAlert, color: '#EF4444', title: 'Sauvegarde à vérifier', text: 'Quelque chose a bloqué l’envoi. Touche « Réessayer », ou ouvre ton compte pour voir le détail.' },
  'local-offline': { Icon: CloudOff, color: '#94A3B8', title: 'Pas de connexion', text: 'Wallo marche sans internet : tout est gardé sur ton téléphone.' },
};

// Ordre de la légende (du plus calme au plus urgent)
const LEGEND: NetState[] = ['synced', 'syncing', 'slow', 'offline', 'waiting', 'error'];

function netState(c: Cloud): NetState | null {
  if (!c.user) return c.online ? null : 'local-offline'; // sans compte : seulement quand le réseau coupe
  if (!c.online || c.status === 'offline') return c.pending > 0 ? 'waiting' : 'offline';
  if (c.status === 'syncing') return 'syncing';
  if (c.status === 'error' || c.status === 'needs-decision') return 'error';
  if (c.back) return 'back';
  if (c.slow) return 'slow';
  return 'synced';
}

const ago = (d: Date | null) => {
  if (!d) return null;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return `à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

export const NetworkCloud: React.FC<{ cloud: Cloud; onOpenAccount: () => void }> = ({ cloud, onOpenAccount }) => {
  const [open, setOpen] = useState(false);
  const state = netState(cloud);
  if (!state) return null;
  const { Icon, color, title, anim } = LOOK[state];
  const count = state === 'waiting' ? cloud.pending : 0;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`${title}${count ? ` : ${count} en attente` : ''}`}
        title={title}
        className="relative w-8 h-8 rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition"
      >
        {/* key : la petite animation repart à chaque changement d'état */}
        <span key={state} className={`flex items-center justify-center animate-fade-in ${anim ?? ''}`}>
          <Icon className="w-5 h-5" style={{ color }} strokeWidth={2.2} />
        </span>
        {state === 'back' && <span className="absolute inset-0 rounded-full cloud-ring" style={{ boxShadow: `0 0 0 0 ${color}` }} />}
        {count > 0 && (
          <span className="absolute -top-0.5 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && <NetworkSheet cloud={cloud} state={state} onClose={() => setOpen(false)} onOpenAccount={onOpenAccount} />}
    </>
  );
};

const NetworkSheet: React.FC<{ cloud: Cloud; state: NetState; onClose: () => void; onOpenAccount: () => void }> = ({ cloud, state, onClose, onOpenAccount }) => {
  const { Icon, color, title, text } = LOOK[state];
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000); // « il y a 2 min » reste juste
    return () => clearInterval(t);
  }, []);
  const last = ago(cloud.lastSync);
  const canSync = !!cloud.user && cloud.online && state !== 'syncing';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="État de la connexion"
        className="w-full sm:max-w-[400px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head flex justify-end">
          <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* L'état actuel, en grand */}
        <div className="flex flex-col items-center text-center mt-1 mb-5">
          <span className="w-20 h-20 rounded-full flex items-center justify-center mb-3" style={{ background: `${color}1f` }}>
            <Icon className="w-10 h-10" style={{ color }} strokeWidth={2} />
          </span>
          <h2 className="text-[20px] font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="text-[14px] text-slate-500 mt-1 leading-snug max-w-[300px] [text-wrap:pretty]">{text}</p>
        </div>

        {/* Détails */}
        {(cloud.user || cloud.pending > 0) && (
          <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden mb-4">
            {cloud.pending > 0 && state !== 'synced' && (
              <div className="flex items-center justify-between gap-3 px-4 min-h-[48px]">
                <span className="text-[15px] text-slate-900">En attente d'envoi</span>
                <span className="text-[15px] font-semibold tabular-nums text-amber-600">
                  {cloud.pending} modification{cloud.pending > 1 ? 's' : ''}
                </span>
              </div>
            )}
            {cloud.user && (
              <div className="flex items-center justify-between gap-3 px-4 min-h-[48px]">
                <span className="text-[15px] text-slate-900">Dernière sauvegarde</span>
                <span className="text-[15px] text-slate-500">{last ?? 'pas encore'}</span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 mb-5">
          {canSync && (
            <button
              onClick={() => cloud.syncNow()}
              className="w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" /> {state === 'error' ? 'Réessayer' : 'Sauvegarder maintenant'}
            </button>
          )}
          <button
            onClick={() => {
              onClose();
              onOpenAccount();
            }}
            className="w-full h-12 rounded-2xl bg-slate-100 text-[15px] font-semibold text-slate-700 flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
          >
            <User className="w-4 h-4" /> {cloud.user ? 'Mon compte' : 'Créer un compte pour sauvegarder'}
          </button>
        </div>

        {/* Légende : ce que veut dire chaque nuage */}
        <h3 className="text-left text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-2 px-4">Les nuages</h3>
        <ul className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
          {LEGEND.map((k) => {
            const l = LOOK[k];
            return (
              <li key={k} className={`flex items-center gap-3 px-4 min-h-[44px] ${k === state || (k === 'synced' && state === 'back') || (k === 'offline' && state === 'local-offline') ? 'bg-slate-200/50' : ''}`}>
                <l.Icon className="w-5 h-5 shrink-0" style={{ color: l.color }} strokeWidth={2.2} />
                <span className="text-[14px] text-slate-700">{l.title}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
