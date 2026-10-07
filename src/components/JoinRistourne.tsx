import React, { useEffect, useState } from 'react';
import { X, Loader2, Users, PartyPopper, Check, ScanLine } from 'lucide-react';
import type { Cloud, RistourneInviteInfo } from '../lib/sync/useCloud';
import { cleanCode, formatCode } from '../lib/invite';
import { frenchError, LoginSheet } from './Account';
import { formatMoney } from '../lib/money';
import { frequencyText } from '../lib/ristourne';
import { haptic } from '../lib/haptics';
import type { Ristourne } from '../types';

const PROBLEMS: Partial<Record<RistourneInviteInfo['status'], string>> = {
  invalid: "Ce code n'existe pas. Vérifie-le (8 caractères, ex. K7P4-QX9M).",
  expired: "Ce lien a expiré ou a été annulé. Demande-en un nouveau à la personne qui t'a invité.",
  blocked: "Trop de codes faux d'affilée. Réessaie dans une heure.",
  owner: "C'est ta propre ristourne : envoie ce lien aux membres que tu veux inviter.",
};

// « Rejoindre une ristourne » : ouvert par un lien /t/CODE, ou depuis Ristournes avec un code à taper
// (utile quand le lien s'ouvre dans le navigateur alors que Wallo est installée sur l'écran d'accueil)
export const JoinRistourneSheet: React.FC<{
  cloud: Cloud;
  initialCode: string; // '' = à taper
  profileName: string;
  onClose: () => void;
  onJoined: (name: string) => void;
  onScan?: () => void; // « Scanner un code QR » : ouvre le scanner de l'app
}> = ({ cloud, initialCode, profileName, onClose, onJoined, onScan }) => {
  const [code, setCode] = useState(cleanCode(initialCode));
  const [checked, setChecked] = useState<string | null>(null); // code déjà vérifié
  const [info, setInfo] = useState<RistourneInviteInfo | null>(null);
  const [name, setName] = useState(profileName);
  const [claim, setClaim] = useState<string | null>(null); // place notée par son nom (« Je suis Kemy »), ou null = nouveau membre
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [login, setLogin] = useState(false);
  const ready = code.length === 8;

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
      setInfo(await cloud.checkRistourneInvite(c));
    });

  // Code reçu par lien : on le vérifie dès qu'on est connecté
  useEffect(() => {
    if (cloud.user && initialCode && checked === null) check(cleanCode(initialCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.user]);

  const join = () =>
    run(async () => {
      const res = await cloud.joinRistourne(info!.code!, name.trim(), claim);
      if (res.status === 'joined') haptic('success');
      setInfo(res);
    });

  const field = 'w-full px-4 py-3 rounded-2xl bg-slate-100 text-base outline-none focus:ring-2 focus:ring-accent';
  const primary = 'w-full py-3.5 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40';
  const problem = info && PROBLEMS[info.status];
  const slots = info?.slots ?? [];
  const every =
    info?.frequency && frequencyText({ frequency: info.frequency as Ristourne['frequency'], everyDays: info.every_days ?? undefined });

  let body: React.ReactNode;
  if (!cloud.configured) {
    body = <p className="text-sm text-slate-500">Les ristournes en ligne ne sont pas encore disponibles.</p>;
  } else if (!cloud.user) {
    body = (
      <>
        <p className="text-sm text-slate-500 mb-4">
          Pour rejoindre {initialCode ? 'cette ristourne' : 'une ristourne'}, connecte-toi à Wallo. Pas de compte ? Il est créé tout de suite avec ton e-mail.
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
  } else if (!info && checked !== null && busy) {
    body = (
      <div className="py-8 flex justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  } else if (info?.status === 'joined') {
    body = (
      <div className="text-center py-2 animate-fade-in">
        <span className="w-14 h-14 rounded-full bg-accent flex items-center justify-center mx-auto mb-3">
          <PartyPopper className="w-7 h-7 text-slate-900" />
        </span>
        <p className="text-base font-bold text-slate-900">Tu as rejoint « {info.ristourne_name} »</p>
        <p className="text-sm text-slate-500 mt-1 mb-5">Tu vois les tours, qui a payé, et tu peux noter tes cotisations.</p>
        <button onClick={() => onJoined(info.ristourne_name ?? '')} className={primary}>
          Voir la ristourne
        </button>
      </div>
    );
  } else if (info?.status === 'ok' || info?.status === 'already') {
    body = (
      <div className="animate-fade-in">
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 mb-4 text-center">
          <p className="text-xs text-slate-500">{info.owner_name} t'invite à rejoindre la ristourne</p>
          <p className="text-xl font-extrabold text-slate-900 mt-1">« {info.ristourne_name} »</p>
          {info.contribution != null && info.currency && (
            <p className="text-sm text-slate-700 mt-1">
              {formatMoney(info.contribution, info.currency)} {every}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
            <Users className="w-3.5 h-3.5" /> {info.members ?? 0} membre{(info.members ?? 0) > 1 ? 's' : ''}
          </p>
        </div>
        {info.status === 'already' ? (
          <>
            <p className="text-sm text-slate-600 mb-4 text-center">Tu fais déjà partie de cette ristourne.</p>
            <button onClick={() => onJoined(info.ristourne_name ?? '')} className={primary}>
              Voir la ristourne
            </button>
          </>
        ) : (
          <>
            {/* L'organisateur t'a peut-être déjà noté par ton nom : reprends ta place (et ton tour) */}
            {slots.length > 0 && (
              <>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Qui es-tu dans la liste ?</p>
                <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 mb-3">
                  {slots.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setClaim(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer ${claim === s.id ? 'is-selected' : ''}`}
                    >
                      <span className="w-6 text-xs font-bold text-slate-400 tabular-nums">{s.turn}.</span>
                      <span className="flex-1 text-sm font-semibold text-slate-900">Je suis {s.name}</span>
                      {claim === s.id && <Check className="w-4 h-4 text-emerald-600" />}
                    </button>
                  ))}
                  <button
                    onClick={() => setClaim(null)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer ${claim === null ? 'is-selected' : ''}`}
                  >
                    <span className="w-6 text-xs font-bold text-slate-400">+</span>
                    <span className="flex-1 text-sm font-semibold text-slate-900">Je ne suis pas dans la liste</span>
                    {claim === null && <Check className="w-4 h-4 text-emerald-600" />}
                  </button>
                </div>
              </>
            )}
            {claim === null && (
              <>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Ton prénom (les autres membres le verront)</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Marie" autoComplete="given-name" className={`${field} mb-3`} />
              </>
            )}
            <button onClick={join} disabled={busy || (claim === null && !name.trim())} className={primary}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Rejoindre
            </button>
            <p className="text-[12px] text-slate-500 mt-3 text-center">
              {claim === null ? 'Tu seras ajouté au dernier tour. ' : 'Tu gardes le tour prévu pour toi. '}
              L'organisateur peut changer l'ordre des tours.
            </p>
          </>
        )}
      </div>
    );
  } else {
    // Code à taper (ou code d'un lien qui ne marche pas : on peut en taper un autre)
    body = (
      <>
        <p className="text-sm text-slate-500 mb-4">Tape le code reçu avec l'invitation, ou colle le lien.</p>
        <input
          value={formatCode(code)}
          onChange={(e) => {
            // Lien collé en entier (…/t/K7P4QX9M) : on garde juste le code
            const v = e.target.value;
            const fromLink = v.match(/\/t\/([A-Za-z0-9-]{4,20})/);
            setCode(cleanCode(fromLink ? fromLink[1] : v).slice(0, 8));
            setInfo(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && ready && check(code)}
          placeholder="K7P4-QX9M"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className={`${field} text-center text-2xl font-extrabold tracking-[0.2em] uppercase`}
        />
        {info && <p className="text-sm text-red-600 mt-3">{problem ?? "Ce code d'invitation ne marche pas."}</p>}
        <button onClick={() => check(code)} disabled={!ready || busy} className={`${primary} mt-3`}>
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
          <div className="sheet-head flex items-center justify-between mb-2">
            <h2 className="text-base font-bold">Rejoindre une ristourne</h2>
            <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          {body}
          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        </div>
      </div>
      {login && !cloud.user && <LoginSheet cloud={cloud} onClose={() => setLogin(false)} />}
    </>
  );
};
