import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Delete, Fingerprint, Lock, ScanFace } from 'lucide-react';
import {
  bioAvailable, checkBio, checkPin, disableBio, disableLock, enableBio, lockEnabled, PIN_LENGTH, setLockDelay, setPin, useLockConfig,
} from '../lib/lock';
import { haptic } from '../lib/haptics';
import type { Cloud } from '../lib/sync/useCloud';

const isApple = () => /iPhone|iPad|Macintosh/.test(navigator.userAgent);
const BioIcon = isApple() ? ScanFace : Fingerprint;
const bioName = () => (isApple() ? 'Face ID / Touch ID' : 'Empreinte / visage');

// ---------- Pavé de code (verrou, création, désactivation) ----------
export const PinPad: React.FC<{
  title: string;
  hint?: string;
  onComplete: (pin: string) => Promise<boolean> | boolean; // false : mauvais code (secousse)
  onBio?: () => void;
  footer?: React.ReactNode;
}> = ({ title, hint, onComplete, onBio, footer }) => {
  const [pin, setPinText] = useState('');
  const [shake, setShake] = useState(false);
  const busy = useRef(false);

  const press = useCallback((k: string) => {
    if (busy.current) return;
    setPinText((p) => (k === 'del' ? p.slice(0, -1) : p.length >= PIN_LENGTH ? p : p + k));
  }, []);

  // Code complet : on le vérifie une seule fois (seulement quand la saisie change, pas quand le parent se redessine)
  const complete = useRef(onComplete);
  complete.current = onComplete;
  useEffect(() => {
    if (pin.length !== PIN_LENGTH || busy.current) return;
    busy.current = true;
    Promise.resolve(complete.current(pin)).then((ok) => {
      busy.current = false;
      if (!ok) {
        haptic('warning');
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
      setPinText('');
    });
  }, [pin]);

  // Clavier physique (ordinateur)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const key = 'h-16 rounded-full text-2xl font-semibold text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition cursor-pointer flex items-center justify-center';
  return (
    <div className="w-full max-w-[300px] mx-auto flex flex-col items-center">
      <h2 className="text-lg font-bold text-slate-900 text-center">{title}</h2>
      {hint && <p className="text-sm text-slate-500 text-center mt-1">{hint}</p>}
      <div className={`flex gap-4 my-8 ${shake ? 'animate-shake' : ''}`} aria-live="polite" aria-label={`${pin.length} chiffre${pin.length > 1 ? 's' : ''} sur ${PIN_LENGTH}`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={`w-3.5 h-3.5 rounded-full transition ${i < pin.length ? 'bg-slate-900 scale-110' : 'bg-slate-200'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-3 w-full">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <button key={k} onClick={() => press(k)} className={key}>
            {k}
          </button>
        ))}
        {onBio ? (
          <button onClick={onBio} aria-label={`Déverrouiller avec ${bioName()}`} className={key}>
            <BioIcon className="w-7 h-7" />
          </button>
        ) : (
          <span />
        )}
        <button onClick={() => press('0')} className={key}>
          0
        </button>
        <button onClick={() => press('del')} aria-label="Effacer" className={key}>
          <Delete className="w-6 h-6" />
        </button>
      </div>
      {footer}
    </div>
  );
};

// ---------- Écran de verrouillage (au démarrage et au retour dans l'app) ----------
export const AppLock: React.FC<{ cloud: Cloud }> = ({ cloud }) => {
  const config = useLockConfig();
  const [locked, setLocked] = useState(lockEnabled);
  const [wrong, setWrong] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [forgot, setForgot] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Retour dans l'app après le délai choisi : on reverrouille
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (lockEnabled() && hiddenAt && Date.now() - hiddenAt >= (config?.delay ?? 60) * 1000) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [config?.delay]);

  const tryBio = useCallback(async () => {
    if (await checkBio()) {
      haptic('success');
      setLocked(false);
      setWrong(0);
    }
  }, []);

  // Face ID proposé tout de suite à l'ouverture
  const shown = locked && !!config;
  useEffect(() => {
    if (shown && config?.bio) void tryBio();
  }, [shown, config?.bio, tryBio]);

  // Trop d'essais : petite attente
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waitUntil]);

  if (!shown) return null;
  const waiting = waitUntil > now;

  return (
    <div className="fixed inset-0 z-[95] bg-white flex flex-col items-center justify-center px-6 animate-fade-in" role="dialog" aria-modal="true" aria-label="Wallo est verrouillé">
      <img src="/icons/wallo.svg" alt="" className="w-14 h-14 mb-5" />
      {forgot ? (
        <div className="w-full max-w-[320px] text-center">
          <Lock className="w-8 h-8 mx-auto text-slate-400 mb-3" />
          {cloud.user ? (
            <>
              <h2 className="text-lg font-bold text-slate-900">Code oublié</h2>
              <p className="text-sm text-slate-500 mt-2">
                Déconnecte-toi : tes données sont gardées en ligne. Reconnecte-toi ensuite avec {cloud.user.email || 'ton compte'} pour tout retrouver, puis choisis un nouveau code.
              </p>
              <button
                onClick={async () => {
                  await cloud.signOut().catch(() => {});
                  disableLock();
                  setLocked(false);
                }}
                className="mt-5 w-full py-3 rounded-2xl bg-accent hover:bg-accent-hover text-sm font-bold cursor-pointer"
              >
                Me déconnecter
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-slate-900">Code oublié</h2>
              <p className="text-sm text-slate-500 mt-2">
                Sans compte, tes données ne sont que sur cet appareil : la seule solution est de les effacer. Toutes tes opérations seront perdues.
              </p>
              <button
                onClick={() => {
                  if (!confirm('Effacer toutes les données de Wallo sur cet appareil ? Impossible d\'annuler.')) return;
                  Object.keys(localStorage).filter((k) => k.startsWith('ap.')).forEach((k) => localStorage.removeItem(k));
                  location.reload();
                }}
                className="mt-5 w-full py-3 rounded-2xl bg-red-600 text-white text-sm font-bold cursor-pointer"
              >
                Effacer les données de cet appareil
              </button>
            </>
          )}
          <button onClick={() => setForgot(false)} className="mt-3 w-full py-3 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
            Retour
          </button>
        </div>
      ) : (
        <PinPad
          title={waiting ? `Patiente ${Math.ceil((waitUntil - now) / 1000)} s` : 'Entre ton code'}
          hint={wrong > 0 && !waiting ? 'Code incorrect' : undefined}
          onBio={config?.bio ? tryBio : undefined}
          onComplete={async (pin) => {
            if (waitUntil > Date.now()) return false;
            if (await checkPin(pin)) {
              setLocked(false);
              setWrong(0);
              return true;
            }
            const n = wrong + 1;
            setWrong(n);
            if (n % 5 === 0) {
              setWaitUntil(Date.now() + 30_000); // 5 erreurs : 30 s d'attente
              setNow(Date.now());
            }
            return false;
          }}
          footer={
            <button onClick={() => setForgot(true)} className="mt-6 text-sm font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">
              Code oublié ?
            </button>
          }
        />
      )}
    </div>
  );
};

// ---------- Paramètres › Verrouillage ----------
const DELAYS: [number, string][] = [
  [0, 'Tout de suite'],
  [60, 'Après 1 min'],
  [300, 'Après 5 min'],
];

export const LockSettings: React.FC = () => {
  const config = useLockConfig();
  const [step, setStep] = useState<null | 'new' | 'confirm' | 'off'>(null);
  const [first, setFirst] = useState('');
  const [bio, setBio] = useState(false);
  useEffect(() => {
    void bioAvailable().then(setBio);
  }, []);

  const sheet = (content: React.ReactNode) => (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={() => setStep(null)}>
      <div className="w-full sm:max-w-[420px] bg-white rounded-t-[28px] sm:rounded-[28px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up" onClick={(e) => e.stopPropagation()}>
        {content}
        <button onClick={() => setStep(null)} className="mt-4 w-full py-3 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
          Annuler
        </button>
      </div>
    </div>
  );

  return (
    <>
      {!config ? (
        <button
          onClick={() => setStep('new')}
          className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-800 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Lock className="w-4 h-4" /> Choisir un code
        </button>
      ) : (
        <div className="space-y-4">
          {bio && (
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="flex items-center gap-2.5">
                <BioIcon className="w-4 h-4 text-slate-700" />
                <span className="text-sm font-semibold text-slate-800">{bioName()}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={!!config.bio}
                onChange={(e) => (e.target.checked ? void enableBio() : disableBio())}
                className="toggle shrink-0"
              />
            </label>
          )}
          <div>
            <div className="text-xs font-bold text-slate-500 mb-2">Redemander le code en revenant dans l'app</div>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100">
              {DELAYS.map(([d, label]) => (
                <button
                  key={d}
                  onClick={() => setLockDelay(d)}
                  aria-pressed={config.delay === d}
                  className={`py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${config.delay === d ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep('new')} className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700 cursor-pointer">
              Changer le code
            </button>
            <button onClick={() => setStep('off')} className="flex-1 py-2.5 rounded-2xl text-sm font-semibold text-red-600 hover:bg-red-50 cursor-pointer">
              Retirer le code
            </button>
          </div>
        </div>
      )}

      {step === 'new' &&
        sheet(
          <PinPad
            key="new"
            title="Choisis un code à 4 chiffres"
            hint="Il sera demandé à chaque ouverture de Wallo."
            onComplete={(pin) => {
              setFirst(pin);
              setStep('confirm');
              return true;
            }}
          />,
        )}
      {step === 'confirm' &&
        sheet(
          <PinPad
            key="confirm"
            title="Tape-le encore une fois"
            onComplete={async (pin) => {
              if (pin !== first) return false;
              await setPin(pin);
              haptic('success');
              setStep(null);
              return true;
            }}
          />,
        )}
      {step === 'off' &&
        sheet(
          <PinPad
            key="off"
            title="Entre ton code actuel"
            hint="Pour retirer le verrouillage."
            onComplete={async (pin) => {
              if (!(await checkPin(pin))) return false;
              disableLock();
              setStep(null);
              return true;
            }}
          />,
        )}
    </>
  );
};
