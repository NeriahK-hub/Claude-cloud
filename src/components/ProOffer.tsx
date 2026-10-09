import React, { useState } from 'react';
import { Check, ChevronRight, Sparkles, X } from 'lucide-react';
import type { Cloud } from '../lib/sync/useCloud';
import { usePro } from '../lib/pro';

// « Passer à Wallo Pro » : carte dans Profil (seulement si l'admin allume l'offre) + la fiche qui montre
// ce qui est gratuit et ce qui est Pro. Pas de prix pour l'instant : l'accès est donné par l'admin.
// Couleurs fixes (carte sombre en clair comme en sombre), comme les cartes de la page de bienvenue.

export const ProCard: React.FC<{ cloud: Cloud }> = ({ cloud }) => {
  const pro = usePro(cloud);
  const [open, setOpen] = useState(false);
  if (!pro.offer) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-3xl p-5 mb-4 flex items-center gap-4 cursor-pointer active:scale-[0.99] transition"
        style={{ background: 'linear-gradient(135deg, #1c1c22, #2c2c36)' }}
      >
        <span className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shrink-0">
          <Sparkles className="w-6 h-6" style={{ color: 'var(--on-accent)' }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] font-bold" style={{ color: '#fff' }}>
            {pro.active ? 'Wallo Pro' : 'Passer à Wallo Pro'}
          </span>
          <span className="block text-[13px] leading-snug mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {pro.active ? 'Ton accès est actif. Merci !' : 'Plus de fonctions pour ton argent'}
          </span>
        </span>
        {pro.active ? (
          <span className="shrink-0 h-8 px-3 rounded-full bg-accent text-[12px] font-bold flex items-center gap-1" style={{ color: 'var(--on-accent)' }}>
            <Check className="w-3.5 h-3.5" strokeWidth={3} /> Actif
          </span>
        ) : (
          <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ color: '#fff', background: 'rgba(255,255,255,0.14)' }} aria-hidden>
            <ChevronRight className="w-5 h-5" />
          </span>
        )}
      </button>
      {open && <ProSheet cloud={cloud} onClose={() => setOpen(false)} />}
    </>
  );
};

const ProSheet: React.FC<{ cloud: Cloud; onClose: () => void }> = ({ cloud, onClose }) => {
  const pro = usePro(cloud);
  const free = pro.features.filter((f) => f.tier === 'free');
  const paid = pro.features.filter((f) => f.tier === 'pro');
  const row = (f: { id: string; label: string; description: string }, isPro: boolean) => (
    <li key={f.id} className="flex items-start gap-3 py-2.5">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isPro ? 'bg-accent' : 'bg-emerald-500/15'}`}>
        {isPro ? <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--on-accent)' }} /> : <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-slate-900">{f.label}</span>
        {f.description && <span className="block text-[13px] text-slate-500 leading-snug">{f.description}</span>}
      </span>
    </li>
  );
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Wallo Pro" className="w-full sm:max-w-[440px] max-h-[92dvh] flex flex-col bg-white rounded-t-[32px] sm:rounded-[32px] animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-accent flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" style={{ color: 'var(--on-accent)' }} />
          </span>
          <h2 className="flex-1 text-[22px] font-extrabold tracking-tight text-slate-900">
            Wallo Pro
            {pro.preview && <span className="ml-2 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Aperçu</span>}
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-2">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-slate-400 mt-5 mb-1">Avec Wallo Pro</h3>
          <ul className="divide-y divide-slate-100">{paid.map((f) => row(f, true))}</ul>
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-slate-400 mt-5 mb-1">Gratuit pour tous</h3>
          <ul className="divide-y divide-slate-100">{free.map((f) => row(f, false))}</ul>
        </div>
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-100">
          <p className="text-[13px] text-center text-slate-500 mb-3">{pro.active ? 'Tu as Wallo Pro. Merci de ton soutien !' : 'Les prix seront annoncés bientôt.'}</p>
          <button onClick={onClose} className="w-full h-[52px] rounded-2xl bg-accent hover:bg-accent-hover font-bold text-[16px] cursor-pointer active:scale-[0.98] transition">
            {pro.active ? 'Fermer' : 'Compris'}
          </button>
        </div>
      </div>
    </div>
  );
};
