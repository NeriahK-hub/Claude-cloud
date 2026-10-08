import React, { useEffect, useState } from 'react';
import { Cloud as CloudIcon, CloudOff, CloudAlert, RefreshCw, LogOut, Mail, X, Check, Loader2, Merge, Replace, Trash2, ChevronLeft, ClipboardPaste, Smartphone, Monitor, ChevronDown } from 'lucide-react';
import { deviceKey, DeviceRow } from '../lib/devices';
import type { Cloud } from '../lib/sync/useCloud';
import { useFeature } from '../lib/remoteConfig';

// Messages d'erreur de Supabase, en clair
export function frenchError(msg: string): string {
  if (/(join_wallet|create_wallet_invite|wallet_invite_check|revoke_wallet_invites)/.test(msg) && /(find|exist|schema cache)/i.test(msg))
    return "L'invitation par lien n'est pas encore activée sur le serveur.";
  if (/ristourne/.test(msg) && /(find|exist|schema cache)/i.test(msg))
    return "L'invitation à une ristourne n'est pas encore activée sur le serveur (migration 20261006000000_ristourne_custom_invites.sql à exécuter dans Supabase).";
  if (/schema cache|Could not find the function|does not exist/i.test(msg)) return "Le serveur n'est pas encore à jour : une migration reste à exécuter dans Supabase.";
  if (/expired|invalid/i.test(msg) && /token|otp|code/i.test(msg)) return 'Code incorrect ou expiré. Vérifie-le ou demande un nouveau code.';
  if (/after \d+ seconds|rate limit|too many/i.test(msg)) return 'Trop de demandes : attends une minute avant de redemander un code.';
  if (/invalid.*email|email.*invalid/i.test(msg)) return "Cette adresse e-mail n'est pas valide.";
  if (/provider is not enabled|unsupported provider/i.test(msg)) return "La connexion Google n'est pas encore activée sur le compte en ligne.";
  if (/delete_my_account/i.test(msg)) return "La suppression de compte n'est pas encore activée sur le serveur.";
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
  const accountsOn = useFeature('accounts');
  const [confirmOut, setConfirmOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  // Connexion désactivée depuis l'espace admin (les personnes déjà connectées restent connectées)
  if (!cloud.user && !accountsOn) {
    return (
      <div className="bg-white rounded-3xl p-4 border border-slate-100 mb-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <CloudOff className="w-5 h-5 text-slate-500" />
        </span>
        <p className="text-xs text-slate-500">La connexion est indisponible pour le moment. Tes données restent sur cet appareil.</p>
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
          <span className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shrink-0">
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
      <DevicesList cloud={cloud} />
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
        <div className="mt-3 flex items-center justify-between gap-3">
          <button onClick={() => setConfirmOut(true)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 cursor-pointer">
            <LogOut className="w-3.5 h-3.5" /> Se déconnecter
          </button>
          <button onClick={() => setDeleting(true)} className="text-xs font-semibold text-slate-400 hover:text-red-600 cursor-pointer">
            Supprimer mon compte
          </button>
        </div>
      )}
      {deleting && <DeleteAccountSheet cloud={cloud} onClose={() => setDeleting(false)} />}
    </div>
  );
};

// Appareils où ton compte est ouvert : on les voit, et on peut déconnecter tous les autres d'un coup
const seenAgo = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} jours`;
};

const DevicesList: React.FC<{ cloud: Cloud }> = ({ cloud }) => {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<DeviceRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const me = deviceKey();

  const load = async () => {
    setError('');
    try {
      setList(await cloud.listDevices());
    } catch (e) {
      setError(frenchError(e instanceof Error ? e.message : String(e)));
    }
  };
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !list) void load();
  };
  const others = (list ?? []).filter((d) => d.device_key !== me);
  const kickOthers = async () => {
    setBusy(true);
    setError('');
    try {
      await cloud.signOutOthers();
      await Promise.all(others.map((d) => cloud.forgetDevice(d.id).catch(() => {})));
      setConfirm(false);
      setDone(true);
      await load();
    } catch (e) {
      setError(frenchError(e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <button onClick={toggle} aria-expanded={open} className="w-full flex items-center justify-between text-left cursor-pointer">
        <span className="text-[13px] font-semibold text-slate-700">Appareils connectés</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 animate-fade-in">
          {!list && !error && (
            <div className="py-3 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          )}
          {error && <p className="text-[13px] text-red-600 py-2">{error}</p>}
          {list && (
            <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
              {list.map((d) => {
                const here = d.device_key === me;
                const Icon = /iPhone|Android|iPad/.test(d.name) ? Smartphone : Monitor;
                return (
                  <div key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <Icon className="w-5 h-5 text-slate-500 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold text-slate-900 truncate">{d.name}</span>
                      <span className="block text-[12px] text-slate-500">{here ? 'Cet appareil · en ce moment' : `Vu ${seenAgo(d.last_seen)}`}</span>
                    </span>
                  </div>
                );
              })}
              {list.length === 0 && <p className="px-3.5 py-3 text-[13px] text-slate-500">Aucun appareil pour l’instant.</p>}
            </div>
          )}
          {done && <p className="text-[13px] text-emerald-700 mt-2 px-1">Les autres appareils sont déconnectés. Ils devront se reconnecter avec un code.</p>}
          {others.length > 0 &&
            (confirm ? (
              <div className="mt-2 p-3 rounded-2xl bg-red-50">
                <p className="text-sm text-slate-700 mb-2">Déconnecter les autres appareils ? Celui-ci reste connecté. Ils devront se reconnecter avec un code.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold cursor-pointer">
                    Annuler
                  </button>
                  <button onClick={kickOthers} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer disabled:opacity-60">
                    {busy ? '…' : 'Déconnecter'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirm(true)} className="mt-2 text-[13px] font-semibold text-red-600 cursor-pointer">
                Déconnecter les autres appareils
              </button>
            ))}
          <p className="text-[12px] text-slate-400 mt-2 px-1 leading-snug">Perdu ou prêté ton téléphone ? Déconnecte les autres appareils : ils n’auront plus accès à ton compte.</p>
        </div>
      )}
    </div>
  );
};

const CONFIRM_WORD = 'SUPPRIMER';

// Suppression définitive : on explique ce qui part, on fait taper un mot pour confirmer
const DeleteAccountSheet: React.FC<{ cloud: Cloud; onClose: () => void }> = ({ cloud, onClose }) => {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = word.trim().toUpperCase() === CONFIRM_WORD;
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await cloud.deleteAccount();
      onClose();
    } catch (e) {
      setError(frenchError(e instanceof Error ? e.message : String(e)));
      setBusy(false);
    }
  };
  return (
    <Sheet title="Supprimer mon compte" onClose={busy ? undefined : onClose}>
      <p className="text-sm text-slate-500 mb-3">
        C'est définitif. Ton compte <b className="text-slate-800">{cloud.user?.email}</b> et tes données en ligne seront effacés, ainsi que celles de cet appareil.
      </p>
      <ul className="text-sm text-slate-600 space-y-1.5 mb-3 list-disc pl-5">
        <li>Tes portefeuilles, opérations, catégories, budgets et dettes.</li>
        <li>Les portefeuilles et ristournes que tu as créés, <b>aussi pour les personnes avec qui tu les partages</b>.</li>
        <li>Dans les portefeuilles des autres, tes opérations restent (sans ton nom) ; dans leurs ristournes, ta place reste.</li>
      </ul>
      <p className="text-xs text-slate-500 mb-3 p-3 rounded-2xl bg-slate-100">
        Tu veux garder une copie ? Exporte d'abord tes données : Paramètres › Mes données.
      </p>
      <label className="block text-xs font-semibold text-slate-500 mb-1">
        Tape <b className="text-slate-900">{CONFIRM_WORD}</b> pour confirmer
      </label>
      <input
        value={word}
        onChange={(e) => setWord(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        className="w-full px-4 py-3 rounded-2xl bg-slate-100 text-base outline-none focus:ring-2 focus:ring-red-300 mb-3"
      />
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <button
        onClick={run}
        disabled={!ok || busy}
        className="w-full py-3.5 rounded-2xl bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Supprimer définitivement
      </button>
    </Sheet>
  );
};

const Sheet: React.FC<{ title: string; onClose?: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      className="w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-head flex items-center justify-between mb-2">
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

// Page de connexion en plein écran (sur téléphone, une fenêtre du bas était cachée par le clavier)
const FullPage: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto animate-screen pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="px-5 pt-3">
        <button onClick={onClose} aria-label="Retour" className="w-11 h-11 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="w-full max-w-sm mx-auto px-5 pt-6">
        <img src="/icons/wallo.svg" alt="" className="w-16 h-16 mx-auto mb-4" />
        <h2 className="text-2xl font-bold tracking-tight text-center mb-2">{title}</h2>
        {children}
      </div>
    </div>
  );
};

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

  const field = 'w-full px-4 py-3 rounded-2xl bg-slate-100 text-base outline-none focus:ring-2 focus:ring-accent';
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <FullPage title={step === 'email' ? 'Se connecter à Wallo' : 'Entre le code reçu'} onClose={onClose}>
      {step === 'email' ? (
        <>
          <p className="text-sm text-slate-500 text-center mb-6">Pas de mot de passe : on t'envoie un code par e-mail. Si tu n'as pas encore de compte, il est créé.</p>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && validEmail && send()}
            placeholder="ton.adresse@exemple.com"
            className={field}
          />
          <button
            onClick={send}
            disabled={!validEmail || busy}
            className="w-full mt-3 py-3.5 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
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
          <p className="text-sm text-slate-500 text-center mb-6">
            Code envoyé à <b className="text-slate-800">{email.trim()}</b>. Copie les chiffres de l'e-mail et reviens ici. Pense à regarder les spams.
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
          {/* Coller le code copié dans l'e-mail (et valider tout de suite) */}
          {'clipboard' in navigator && 'readText' in navigator.clipboard && (
            <button
              onClick={async () => {
                const digits = (await navigator.clipboard.readText().catch(() => '')).replace(/\D/g, '').slice(0, 10);
                if (digits.length < 6) return setError('Aucun code copié. Copie les chiffres dans l’e-mail, puis réessaie.');
                setCode(digits);
                run(() => cloud.verifyCode(email, digits));
              }}
              disabled={busy}
              className="w-full mt-3 py-3 rounded-2xl bg-slate-100 text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <ClipboardPaste className="w-4 h-4" /> Coller le code
            </button>
          )}
          <button
            onClick={() => run(() => cloud.verifyCode(email, code))}
            disabled={code.length < 6 || busy}
            className="w-full mt-3 py-3.5 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
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
      {error && <p className="text-sm text-red-600 text-center mt-4">{error}</p>}
    </FullPage>
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
