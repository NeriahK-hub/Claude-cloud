import React, { useState } from 'react';
import { BarChart3, Check, ChevronRight, Cloud, FileText, Sparkles, Users, X } from 'lucide-react';
import type { Cloud as CloudState } from '../lib/sync/useCloud';
import { usePro } from '../lib/pro';

// « Passer à Wallo Pro » : carte dans Profil (seulement si l'admin allume l'offre) + la fiche qui montre
// ce qui est Pro et ce qui est gratuit. Pas de prix pour l'instant : l'accès est donné par l'admin.
// Couleurs fixes (fond noir, lueur violette et citron comme le Wrapped), identiques en clair et en sombre.

const GLOW = '#8B5CF6';
const LIME = '#D8FB52';

// Une petite icône qui parle selon le mot-clé de la fonctionnalité
const iconFor = (label: string) => {
  const t = label.toLowerCase();
  if (/partag|membre|famille/.test(t)) return Users;
  if (/synchro|cloud|appareil|sauvegarde/.test(t)) return Cloud;
  if (/pdf|excel|export|rapport/.test(t)) return FileText;
  if (/analys|courbe|simul|graph|statist/.test(t)) return BarChart3;
  return Sparkles;
};

// Fond noir avec deux boules de lumière qui respirent (comme les cartes Wrapped)
const Glow: React.FC<{ strong?: boolean }> = ({ strong }) => (
  <span className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
    <span className="replay-orb absolute -right-14 -top-20 w-64 h-64 rounded-full" style={{ background: `radial-gradient(closest-side, ${GLOW}${strong ? 'AA' : '77'} 0%, ${GLOW}33 45%, transparent 70%)` }} />
    <span className="replay-orb absolute -left-16 -bottom-24 w-56 h-56 rounded-full" style={{ animationDelay: '-3s', background: `radial-gradient(closest-side, ${LIME}${strong ? '55' : '33'} 0%, ${LIME}11 45%, transparent 70%)` }} />
  </span>
);

export const ProCard: React.FC<{ cloud: CloudState }> = ({ cloud }) => {
  const pro = usePro(cloud);
  const [open, setOpen] = useState(false);
  if (!pro.offer) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-full overflow-hidden text-left rounded-3xl p-5 mb-4 flex items-center gap-4 cursor-pointer active:scale-[0.99] transition"
        style={{ background: '#07070B', boxShadow: `0 0 0 1px rgb(255 255 255 / 0.08), 0 10px 40px ${GLOW}33` }}
      >
        <Glow />
        <span className="relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: LIME, boxShadow: `0 0 28px ${LIME}88` }}>
          <Sparkles className="w-6 h-6" style={{ color: '#0d1015' }} />
        </span>
        <span className="relative flex-1 min-w-0">
          <span className="block text-[17px] font-extrabold tracking-tight whitespace-nowrap truncate" style={{ color: "#fff" }}>
            {pro.active ? 'Wallo Pro' : 'Passer à Wallo Pro'}
          </span>
          <span className="block text-[13px] leading-snug mt-0.5 truncate" style={{ color: 'rgb(255 255 255 / 0.7)' }}>
            {pro.active ? 'Ton accès est actif. Merci !' : 'Va plus loin avec ton argent'}
          </span>
        </span>
        {pro.active ? (
          <span className="relative shrink-0 h-8 px-3 rounded-full text-[12px] font-bold flex items-center gap-1" style={{ background: LIME, color: '#0d1015' }}>
            <Check className="w-3.5 h-3.5" strokeWidth={3} /> Actif
          </span>
        ) : (
          <span className="relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ color: '#fff', background: 'rgb(255 255 255 / 0.14)' }} aria-hidden>
            <ChevronRight className="w-5 h-5" />
          </span>
        )}
      </button>
      {open && <ProSheet cloud={cloud} onClose={() => setOpen(false)} />}
    </>
  );
};

const ProSheet: React.FC<{ cloud: CloudState; onClose: () => void }> = ({ cloud, onClose }) => {
  const pro = usePro(cloud);
  const free = pro.features.filter((f) => f.tier === 'free');
  const paid = pro.features.filter((f) => f.tier === 'pro');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fade-in" style={{ background: 'rgb(0 0 0 / 0.6)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Wallo Pro"
        className="relative w-full sm:max-w-[460px] h-[92dvh] sm:h-auto sm:max-h-[90dvh] flex flex-col overflow-hidden rounded-t-[32px] sm:rounded-[32px] animate-slide-up"
        style={{ background: '#07070B', boxShadow: `0 0 0 1px rgb(255 255 255 / 0.08), 0 0 80px ${GLOW}44` }}
        onClick={(e) => e.stopPropagation()}
      >
        <Glow strong />
        <button onClick={onClose} aria-label="Fermer" className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer" style={{ background: 'rgb(255 255 255 / 0.12)', color: '#fff' }}>
          <X className="w-4 h-4" />
        </button>

        <div className="relative flex-1 min-h-0 overflow-y-auto px-5 pt-10 pb-4">
          {/* En-tête : l'étincelle brille au-dessus du nom */}
          <div className="text-center">
            <span className="wrap-pop relative mx-auto w-[72px] h-[72px] rounded-[24px] flex items-center justify-center" style={{ background: LIME, boxShadow: `0 0 50px ${LIME}99, 0 0 120px ${GLOW}88` }}>
              <Sparkles className="w-9 h-9" style={{ color: '#0d1015' }} />
            </span>
            <h2 className="mt-5 text-[34px] leading-none font-black tracking-tight" style={{ color: '#fff' }}>
              Wallo <span style={{ color: LIME, textShadow: `0 0 28px ${LIME}77` }}>Pro</span>
              {pro.preview && <span className="ml-2 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgb(255 255 255 / 0.14)', color: 'rgb(255 255 255 / 0.8)' }}>Aperçu</span>}
            </h2>
            <p className="mt-2.5 text-[15px] leading-snug mx-auto max-w-[300px]" style={{ color: 'rgb(255 255 255 / 0.7)' }}>
              {pro.active ? 'Ton accès est actif. Merci de ton soutien !' : 'Va plus loin avec ton argent.'}
            </p>
          </div>

          {/* Ce qui est Pro : des cartes en verre, qui arrivent l'une après l'autre */}
          {paid.length > 0 && (
            <ul className="mt-7 space-y-2.5">
              {paid.map((f, i) => {
                const Icon = iconFor(f.label);
                return (
                  <li
                    key={f.id}
                    className="wrap-in flex items-start gap-3.5 rounded-2xl p-3.5"
                    style={{ animationDelay: `${120 + i * 90}ms`, background: 'rgb(255 255 255 / 0.06)', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.09)', backdropFilter: 'blur(6px)' }}
                  >
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${LIME}22`, boxShadow: `inset 0 0 0 1px ${LIME}55` }}>
                      <Icon className="w-5 h-5" style={{ color: LIME }} />
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className="block text-[15.5px] font-bold leading-snug" style={{ color: '#fff' }}>{f.label}</span>
                      {f.description && <span className="block text-[13px] leading-snug mt-0.5" style={{ color: 'rgb(255 255 255 / 0.62)' }}>{f.description}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Ce qui reste gratuit : plus discret */}
          {free.length > 0 && (
            <div className="mt-7">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2.5 px-1" style={{ color: 'rgb(255 255 255 / 0.5)' }}>
                Toujours gratuit
              </h3>
              <ul className="rounded-2xl px-4 py-1.5" style={{ background: 'rgb(255 255 255 / 0.04)', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.06)' }}>
                {free.map((f, i) => (
                  <li key={f.id} className="flex items-center gap-3 py-2.5" style={i ? { borderTop: '1px solid rgb(255 255 255 / 0.06)' } : undefined}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgb(52 211 153 / 0.18)' }}>
                      <Check className="w-3 h-3" strokeWidth={3.5} style={{ color: '#34D399' }} />
                    </span>
                    <span className="text-[14.5px] font-medium" style={{ color: 'rgb(255 255 255 / 0.88)' }}>{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="relative px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]" style={{ background: 'linear-gradient(to top, #07070B 70%, transparent)' }}>
          <p className="text-[13px] text-center mb-3" style={{ color: 'rgb(255 255 255 / 0.55)' }}>
            {pro.active ? 'Tout est débloqué pour toi.' : 'Les prix seront annoncés bientôt.'}
          </p>
          <button
            onClick={onClose}
            className="w-full h-[54px] rounded-2xl font-bold text-[16px] cursor-pointer active:scale-[0.98] transition"
            style={{ background: LIME, color: '#0d1015', boxShadow: `0 0 30px ${LIME}55` }}
          >
            {pro.active ? 'Fermer' : 'Compris'}
          </button>
        </div>
      </div>
    </div>
  );
};
