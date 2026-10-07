import React, { useEffect, useState } from 'react';
import { X, Loader2, Users, PartyPopper, ScanLine } from 'lucide-react';
import type { Cloud, InviteInfo } from '../lib/sync/useCloud';
import { cleanCode, formatCode } from '../lib/invite';
import { frenchError, LoginSheet } from './Account';
import { haptic } from '../lib/haptics';

// Ce qu'on dit à la personne selon la réponse de la base
const PROBLEMS: Partial<Record<InviteInfo['status'], string>> = {
  invalid: "Ce code n'existe pas. Vérifie-le (8 caractères, ex. K7P4-QX9M).",
  expired: 'Ce lien a expiré ou a été annulé. Demande-en un nouveau à la personne qui t\'a invité.',
  blocked: "Trop de codes faux d'affilée. Réessaie dans une heure.",
  owner: "C'est ton propre portefeuille : envoie ce lien à la personne que tu veux inviter.",
};

// « Rejoindre un portefeuille partagé » : ouvert par un lien /r/CODE, ou depuis Portefeuilles avec un code à taper
export const JoinWalletSheet: React.FC<{
  cloud: Cloud;
  initialCode: string; // '' = à taper
  profileName: string;
  onClose: () => void;
  onJoined: (walletName: string) => void;
  onScan?: () => void; // « Scanner un code QR » : ouvre le scanner de l'app
}> = ({ cloud, initialCode, profileName, onClose, onJoined, onScan }) => {
  const [code, setCode] = useState(initialCode);
  const [checked, setChecked] = useState<string | null>(null); // code déjà vérifié
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [name, setName] = useState(profileName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [login, setLogin] = useState(false);
  const ready = cleanCode(code).length === 8;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(frenchError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };
  const check = (c: string) =>
    run(async () => {
      setChecked(c);
      setInfo(await cloud.checkInvite(c));
    });

  // Code reçu par lien : on le vérifie dès qu'on est connecté
  useEffect(() => {
    if (cloud.user && initialCode && checked === null) check(cleanCode(initialCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.user]);

  const join = () =>
    run(async () => {
      const res = await cloud.joinWallet(info!.code!, name.trim());
      if (res.status === 'joined') {
        haptic('success');
        setInfo(res);
      } else setInfo(res); // expiré entre-temps, etc.
    });

  const field = 'w-full px-4 py-3 rounded-2xl bg-slate-100 text-base outline-none focus:ring-2 focus:ring-accent';
  const primary = 'w-full py-3.5 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40';
  const problem = info && PROBLEMS[info.status];

  let body: React.ReactNode;
  if (!cloud.configured) {
    body = <p className="text-sm text-slate-500">Le partage en ligne n'est pas encore disponible.</p>;
  } else if (!cloud.user) {
    body = (
      <>
        <p className="text-sm text-slate-500 mb-4">
          Pour rejoindre{initialCode ? ' ce portefeuille' : ' un portefeuille partagé'}, connecte-toi à Wallo. Pas de compte ? Il est créé tout de suite avec ton e-mail.
        </p>
        {initialCode && (
          <p className="text-xs text-slate-500 mb-4">
            Code d'invitation : <b className="text-slate-800 tracking-wider">{formatCode(initialCode)}</b>
          </p>
        )}
        <button onClick={() => setLogin(true)} className={primary}>
          Se connecter pour rejoindre
        </button>
      </>
    );
  } else if (info?.status === 'joined') {
    body = (
      <div className="text-center py-2 animate-fade-in">
        <span className="w-14 h-14 rounded-full bg-accent flex items-center justify-center mx-auto mb-3">
          <PartyPopper className="w-7 h-7 text-slate-900" />
        </span>
        <p className="text-base font-bold text-slate-900">Tu as rejoint « {info.wallet_name} »</p>
        <p className="text-sm text-slate-500 mt-1 mb-5">Il apparaît dans tes portefeuilles. Tout ce que vous y ajoutez est partagé.</p>
        <button onClick={() => onJoined(info.wallet_name ?? '')} className={primary}>
          Voir mes portefeuilles
        </button>
      </div>
    );
  } else if (info?.status === 'ok' || info?.status === 'already') {
    const others = Math.max(0, (info.members ?? 1) - 1);
    body = (
      <div className="animate-fade-in">
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 mb-4 text-center">
          <p className="text-xs text-slate-500">{info.owner_name} t'invite à rejoindre</p>
          <p className="text-xl font-extrabold text-slate-900 mt-1">« {info.wallet_name} »</p>
          <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
            <Users className="w-3.5 h-3.5" /> {info.owner_name}
            {others > 0 && ` et ${others} autre${others > 1 ? 's' : ''}`}
          </p>
        </div>
        {info.status === 'already' ? (
          <>
            <p className="text-sm text-slate-600 mb-4 text-center">Tu fais déjà partie de ce portefeuille.</p>
            <button onClick={() => onJoined(info.wallet_name ?? '')} className={primary}>
              Voir mes portefeuilles
            </button>
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Ton prénom (les autres membres le verront)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Marie" autoComplete="given-name" className={`${field} mb-3`} />
            <button onClick={join} disabled={busy || !name.trim()} className={primary}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Rejoindre
            </button>
            <p className="text-[12px] text-slate-500 mt-3 text-center">Tu pourras voir ce portefeuille et y ajouter des opérations. Tu peux le quitter quand tu veux.</p>
          </>
        )}
      </div>
    );
  } else {
    // Code à taper (ou lien en cours de vérification)
    body = (
      <>
        <p className="text-sm text-slate-500 mb-4">Tape le code reçu avec l'invitation.</p>
        <input
          value={formatCode(code)}
          onChange={(e) => {
            setCode(cleanCode(e.target.value).slice(0, 8));
            setInfo(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && ready && check(cleanCode(code))}
          placeholder="K7P4-QX9M"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className={`${field} text-center text-2xl font-extrabold tracking-[0.2em] uppercase`}
        />
        {problem && <p className="text-sm text-red-600 mt-3">{problem}</p>}
        <button onClick={() => check(cleanCode(code))} disabled={!ready || busy} className={`${primary} mt-3`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Continuer
        </button>
        {/* Ou scanner le code QR montré par l'autre personne (scanner de l'app) */}
        {onScan && (
          <button onClick={onScan} className="mt-2 w-full h-12 rounded-full bg-slate-100 text-slate-900 text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
            <ScanLine className="w-4.5 h-4.5" /> Scanner un code QR
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
        <div
          className="w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold">Rejoindre un portefeuille</h2>
            <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          {body}
          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        </div>
      </div>
      {/* En dehors de la fenêtre animée : sinon elle y serait enfermée */}
      {login && !cloud.user && <LoginSheet cloud={cloud} onClose={() => setLogin(false)} />}
    </>
  );
};
