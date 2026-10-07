import React, { useState } from 'react';
import { X, Download, Share, SquarePlus, Check, Compass, EllipsisVertical, ExternalLink, Zap, WifiOff, KeyRound, Loader2 } from 'lucide-react';
import { markInstallAsked, promptInstall, useInstallWay } from '../lib/install';
import { haptic } from '../lib/haptics';

// « Installe Wallo sur ton écran d'accueil » : proposé une fois après le tutoriel, et depuis le Profil.
// Les gestes changent selon le téléphone (Android : un bouton ; iPhone : Partager > Sur l'écran d'accueil).

const Step: React.FC<{ n: number; Icon: typeof Share; title: string; hint?: string; delay: number }> = ({ n, Icon, title, hint, delay }) => (
  <li className="flex items-center gap-3.5 animate-pick-in" style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
    <span className="relative w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
      <Icon className="w-6 h-6 text-slate-800" />
      <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-accent text-[11px] font-extrabold flex items-center justify-center">{n}</span>
    </span>
    <span className="min-w-0">
      <span className="block text-[15px] font-semibold text-slate-900 leading-snug">{title}</span>
      {hint && <span className="block text-[12.5px] text-slate-500 leading-snug mt-0.5">{hint}</span>}
    </span>
  </li>
);

const Perk: React.FC<{ Icon: typeof Zap; text: string }> = ({ Icon, text }) => (
  <span className="flex flex-col items-center gap-1.5 text-center">
    <span className="w-10 h-10 rounded-full bg-accent/30 flex items-center justify-center">
      <Icon className="w-5 h-5 text-slate-800" />
    </span>
    <span className="text-[11.5px] font-semibold text-slate-600 leading-tight">{text}</span>
  </span>
);

export const InstallGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const way = useInstallWay();
  const [busy, setBusy] = useState(false);
  const close = () => {
    markInstallAsked();
    onClose();
  };
  const install = async () => {
    setBusy(true);
    const ok = await promptInstall().catch(() => false);
    setBusy(false);
    if (ok) {
      haptic('success');
      close();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Installer Wallo"
        className="w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button onClick={close} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* L'icône de Wallo qui « se pose » sur l'écran d'accueil */}
        <div className="flex flex-col items-center text-center -mt-3">
          <img src="/icons/icon-192.png" alt="" className="w-20 h-20 rounded-[22px] shadow-lg animate-pick-in" />
          <h2 className="mt-4 text-[22px] font-bold tracking-tight text-slate-900">
            {way === 'installed' ? 'Wallo est installé' : 'Mets Wallo sur ton écran d’accueil'}
          </h2>
          <p className="mt-1.5 text-[14px] text-slate-500 leading-snug max-w-[320px]">
            {way === 'installed' ? 'Ouvre-le depuis son icône, comme une vraie app.' : 'Il s’ouvre comme une vraie app, en un geste, même sans internet.'}
          </p>
        </div>

        {way !== 'installed' && (
          <div className="grid grid-cols-3 gap-2 my-5">
            <Perk Icon={Zap} text="S’ouvre en 1 geste" />
            <Perk Icon={WifiOff} text="Marche sans internet" />
            <Perk Icon={KeyRound} text="Tu restes connecté" />
          </div>
        )}

        {way === 'prompt' && (
          <button
            onClick={install}
            disabled={busy}
            className="w-full h-13 py-3.5 rounded-full bg-accent hover:bg-accent-hover text-[16px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />} Installer Wallo
          </button>
        )}

        {way === 'ios' && (
          <ol className="space-y-4">
            <Step n={1} Icon={Share} title="Touche le bouton Partager" hint="En bas de Safari (ou en haut à droite dans Chrome)" delay={80} />
            <Step n={2} Icon={SquarePlus} title="Choisis « Sur l’écran d’accueil »" hint="Fais défiler la liste vers le bas si tu ne le vois pas" delay={200} />
            <Step n={3} Icon={Check} title="Touche « Ajouter »" hint="L’icône Wallo apparaît sur ton écran d’accueil" delay={320} />
          </ol>
        )}

        {way === 'android' && (
          <ol className="space-y-4">
            <Step n={1} Icon={EllipsisVertical} title="Touche le menu ⋮ du navigateur" hint="En haut à droite de Chrome" delay={80} />
            <Step n={2} Icon={Download} title="Choisis « Installer l’application »" hint="Ou « Ajouter à l’écran d’accueil »" delay={200} />
            <Step n={3} Icon={Check} title="Confirme" hint="L’icône Wallo apparaît avec tes autres apps" delay={320} />
          </ol>
        )}

        {way === 'inapp' && (
          <ol className="space-y-4">
            <Step n={1} Icon={EllipsisVertical} title="Touche ⋯ ou ⋮ en haut de l’écran" hint="Tu es dans le navigateur de WhatsApp, Facebook ou Instagram : il ne peut pas installer d’app" delay={80} />
            <Step n={2} Icon={ExternalLink} title="Choisis « Ouvrir dans le navigateur »" hint="Safari sur iPhone, Chrome sur Android" delay={200} />
            <Step n={3} Icon={Compass} title="Puis reviens ici" hint="Le bouton pour installer Wallo apparaîtra" delay={320} />
          </ol>
        )}

        {way === 'desktop' && (
          <p className="text-[14px] text-slate-600 text-center leading-snug">
            Sur ordinateur, clique sur l’icône d’installation dans la barre d’adresse de Chrome ou d’Edge. Sur ton téléphone, ouvre <b>wallo-b13b0.web.app</b>.
          </p>
        )}

        <button onClick={close} className="w-full mt-5 py-3 text-[14px] font-semibold text-slate-500 cursor-pointer">
          {way === 'installed' ? 'Fermer' : 'Plus tard'}
        </button>
      </div>
    </div>
  );
};
