import React, { useEffect, useState } from 'react';
import { Cloud as CloudIcon, CloudOff, CloudAlert, RefreshCw, LogOut, Mail, X, Check, Loader2, Merge, Replace } from 'lucide-react';
import type { Cloud } from '../lib/sync/useCloud';

// Messages d'erreur de Supabase, en clair
function frenchError(msg: string): string {
  if (/expired|invalid/i.test(msg) && /token|otp|code/i.test(msg)) return 'Code incorrect ou expiré. Vérifie-le ou demande un nouveau code.';
  if (/after \d+ seconds|rate limit|too many/i.test(msg)) return 'Trop de demandes : attends une minute avant de redemander un code.';
  if (/invalid.*email|email.*invalid/i.test(msg)) return "Cette adresse e-mail n'est pas valide.";
  if (/provider is not enabled|unsupported provider/i.test(msg)) return "La connexion Google n'est pas encore activée sur le compte en ligne.";
  if (/fetch|network/i.test(msg)) return 'Pas de connexion internet. Réessaie quand le réseau revient.';
  return msg;
}

const ago = (d: Date | null) => {
  if (!d) return '';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return `à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

// Petite icône d'état (en-tête) : synchronisé, en cours, hors ligne, erreur
export const SyncIndicator: React.FC<{ cloud: Cloud; onClick?: () => void }> = ({ cloud, onClick }) => {
  if (!cloud.user) return null;
  const { status } = cloud;
  const [Icon, label, cls] =
    status === 'syncing'
      ? [RefreshCw, 'Synchronisation…', 'text-slate-500 animate-spin']
      : status === 'offline'
        ? [CloudOff, 'Hors ligne : tes modifications seront envoyées au retour du réseau', 'text-amber-600']
        : status === 'error' || status === 'needs-decision'
          ? [CloudAlert, 'Synchronisation à vérifier', 'text-red-600']
          : [CloudIcon, `Synchronisé ${ago(cloud.lastSync)}`, 'text-emerald-600'];
  return (
    <button onClick={onClick} aria-label={label} title={label} className="w-6 h-6 flex items-center justify-center cursor-pointer">
      <Icon className={`w-4 h-4 ${cls}`} />
    </button>
  );
};

// Carte du profil : se connecter / état de la synchro / se déconnecter
export const AccountCard: React.FC<{ cloud: Cloud }> = ({ cloud }) => {
  const [login, setLogin] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000); // « il y a 2 min » reste juste
    return () => clearInterval(t);
  }, []);

  if (!cloud.configured) {
    return (
      <div className="bg-white rounded-3xl p-4 border border-slate-100 mb-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <CloudOff className="w-5 h-5 text-slate-500" />
        </span>
        <p className="text-xs text-slate-500">La sauvegarde en ligne arrive bientôt. Pour l'instant, tes données restent sur cet appareil.</p>
      </div>
    );
  }

  if (!cloud.user) {
    return (
      <>
        <button
          onClick={() => setLogin(true)}
          className="w-full text-left bg-white rounded-3xl p-4 border border-slate-100 mb-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50"
        >
          <span className="w-10 h-10 rounded-full bg-[#D8FB52] flex items-center justify-center shrink-0">
            <CloudIcon className="w-5 h-5 text-slate-900" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-slate-900">Se connecter</span>
            <span className="block text-xs text-slate-500">Sauvegarde tes données, retrouve-les sur tous tes appareils, partage des portefeuilles.</span>
          </span>
        </button>
        {login && <LoginSheet cloud={cloud} onClose={() => setLogin(false)} />}
      </>
    );
  }

  const { status } = cloud;
  const line =
    status === 'syncing'
      ? 'Synchronisation en cours…'
      : status === 'offline'
        ? 'Hors ligne : tes modifications seront envoyées au retour du réseau.'
        : status === 'error'
          ? `Erreur de synchronisation : ${frenchError(cloud.error)}`
          : status === 'needs-decision'
            ? 'En attente de ton choix (fusionner ou remplacer).'
            : `Synchronisé ${ago(cloud.lastSync)}`;

  return (
    <div className="bg-white rounded-3xl p-4 border border-slate-100 mb-4">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
          <CloudIcon className="w-5 h-5 text-emerald-600" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{cloud.user.email}</div>
          <div className={`text-xs ${status === 'error' ? 'text-red-600' : status === 'offline' ? 'text-amber-700' : 'text-slate-500'}`}>{line}</div>
        </div>
        <button
          onClick={cloud.syncNow}
          disabled={status === 'syncing'}
          aria-label="Synchroniser maintenant"
          className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${status === 'syncing' ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {confirmOut ? (
        <div className="mt-3 p-3 rounded-2xl bg-red-50">
          <p className="text-sm text-slate-700 mb-2">
            Se déconnecter ? Tes données restent dans ton compte, mais elles seront effacées de cet appareil.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmOut(false)} className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold cursor-pointer">
              Annuler
            </button>
            <button onClick={cloud.signOut} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer">
              Se déconnecter
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmOut(true)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 cursor-pointer">
          <LogOut className="w-3.5 h-3.5" /> Se déconnecter
        </button>
      )}
    </div>
  );
};

const Sheet: React.FC<{ title: string; onClose?: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      className="w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold">{title}</h2>
        {onClose && (
          <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  </div>
);

// Connexion sans mot de passe : code à 6 chiffres par e-mail, ou compte Google
export const LoginSheet: React.FC<{ cloud: Cloud; onClose: () => void }> = ({ cloud, onClose }) => {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0); // secondes avant de pouvoir redemander un code

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Connecté (code validé ou lien de l'e-mail touché) : on ferme
  useEffect(() => {
    if (cloud.user) onClose();
  }, [cloud.user, onClose]);

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

  const send = () =>
    run(async () => {
      await cloud.sendCode(email);
      setStep('code');
      setWait(60);
    });

  const field = 'w-full px-4 py-3 rounded-2xl bg-slate-100 text-base outline-none focus:ring-2 focus:ring-[#D8FB52]';
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Sheet title={step === 'email' ? 'Se connecter à Wallo' : 'Entre le code reçu'} onClose={onClose}>
      {step === 'email' ? (
        <>
          <p className="text-sm text-slate-500 mb-4">Pas de mot de passe : on t'envoie un code par e-mail. Si tu n'as pas encore de compte, il est créé.</p>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && validEmail && send()}
            placeholder="ton.adresse@exemple.com"
            className={field}
            autoFocus
          />
          <button
            onClick={send}
            disabled={!validEmail || busy}
            className="w-full mt-3 py-3.5 rounded-2xl bg-[#D8FB52] text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Recevoir le code
          </button>
          <div className="flex items-center gap-3 my-4 text-xs text-slate-400">
            <span className="flex-1 h-px bg-slate-200" /> ou <span className="flex-1 h-px bg-slate-200" />
          </div>
          <button
            onClick={() => run(cloud.signInWithGoogle)}
            disabled={busy}
            className="w-full py-3.5 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 flex items-center justify-center gap-2.5 cursor-pointer hover:bg-slate-50 disabled:opacity-40"
          >
            <GoogleLogo /> Continuer avec Google
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-4">
            Code envoyé à <b className="text-slate-800">{email.trim()}</b>. Tape les chiffres reçus, ou touche le lien dans l'e-mail. Pense à regarder les spams.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
            onKeyDown={(e) => e.key === 'Enter' && code.length >= 6 && run(() => cloud.verifyCode(email, code))}
            placeholder="123456"
            className={`${field} text-center text-2xl font-bold tracking-[0.4em] tabular-nums`}
            autoFocus
          />
          <button
            onClick={() => run(() => cloud.verifyCode(email, code))}
            disabled={code.length < 6 || busy}
            className="w-full mt-3 py-3.5 rounded-2xl bg-[#D8FB52] text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Valider
          </button>
          <div className="flex justify-between mt-3 text-xs font-semibold">
            <button onClick={() => { setStep('email'); setCode(''); setError(''); }} className="text-slate-500 cursor-pointer">
              Changer d'adresse
            </button>
            <button onClick={send} disabled={wait > 0 || busy} className="text-emerald-700 cursor-pointer disabled:text-slate-400">
              {wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
    </Sheet>
  );
};

// 1re connexion : ce téléphone ET le compte ont des données -> fusionner ou remplacer
export const MergeDialog: React.FC<{ cloud: Cloud }> = ({ cloud }) => {
  const [confirmReplace, setConfirmReplace] = useState(false);
  const option = (Icon: typeof Merge, title: string, text: string, onClick: () => void, danger = false) => (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl flex gap-3 cursor-pointer transition ${danger ? 'bg-red-50/60 hover:bg-red-50' : 'bg-slate-100 hover:bg-slate-200'}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${danger ? 'text-red-600' : 'text-slate-800'}`} />
      <span>
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{text}</span>
      </span>
    </button>
  );
  return (
    <Sheet title="Ton compte a déjà des données">
      <p className="text-sm text-slate-500 mb-4">
        Ton compte contient {cloud.remoteWallets} portefeuille{cloud.remoteWallets > 1 ? 's' : ''}, et ce téléphone a aussi ses propres données. Que veux-tu faire ?
      </p>
      <div className="space-y-2">
        {option(Merge, 'Tout garder (fusionner)', 'Les données de ce téléphone sont ajoutées à celles du compte.', () => cloud.decide('merge'))}
        {confirmReplace ? (
          <div className="p-4 rounded-2xl bg-red-50">
            <p className="text-sm text-slate-700 mb-2">Les données de ce téléphone seront effacées et remplacées par celles du compte. Sûr ?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReplace(false)} className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold cursor-pointer">
                Annuler
              </button>
              <button onClick={() => cloud.decide('replace')} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer">
                Remplacer
              </button>
            </div>
          </div>
        ) : (
          option(Replace, 'Garder seulement le compte', 'Les données de ce téléphone sont remplacées par celles du compte.', () => setConfirmReplace(true), true)
        )}
      </div>
      <button onClick={cloud.signOut} className="w-full mt-3 py-2.5 text-xs font-semibold text-slate-500 cursor-pointer">
        Annuler et se déconnecter
      </button>
    </Sheet>
  );
};

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
    <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.2-.2-1.7H12v3.9h5.5c-.3 1.4-1.1 2.5-2.3 3.3l3.6 2.8c2.1-2 3.3-4.9 3.3-8.3z" />
    <path fill="#FBBC05" d="M6.1 14.3c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3L2.4 6.9C1.5 8.4 1 10.2 1 12s.5 3.6 1.4 5.1l3.7-2.8z" />
    <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.8-2.5l-3.6-2.8c-.9.6-2.1 1.1-3.2 1.1-2.5 0-4.6-1.7-5.4-4l-3.7 2.8C4.6 19.8 8 22 12 22z" />
  </svg>
);
