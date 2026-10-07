import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Share, PlusSquare, Moon } from 'lucide-react';
import { disableNotifications, enableNotifications, getDailyReminder, pushConfigured, setDailyReminder, showSystemNotification, useNotifyState } from '../lib/notify';

// Paramètres › Notifications : autoriser, couper, tester
export const NotificationsSettings: React.FC = () => {
  const state = useNotifyState();
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState(false);
  const [daily, setDaily] = useState<boolean | null | undefined>(undefined); // undefined : on lit ; null : pas connecté
  const on = state === 'on';
  useEffect(() => {
    if (!on || !pushConfigured) return;
    let alive = true;
    getDailyReminder()
      .then((v) => alive && setDaily(v))
      .catch(() => alive && setDaily(null));
    return () => {
      alive = false;
    };
  }, [on]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (state === 'install') {
    return (
      <div className="text-sm text-slate-600 space-y-2">
        <p>Sur iPhone, les notifications marchent seulement quand Wallo est ajouté à l'écran d'accueil :</p>
        <p className="flex items-center gap-2">
          <Share className="w-4 h-4 shrink-0" /> Touche « Partager » dans Safari
        </p>
        <p className="flex items-center gap-2">
          <PlusSquare className="w-4 h-4 shrink-0" /> puis « Sur l'écran d'accueil », et ouvre Wallo depuis là.
        </p>
      </div>
    );
  }
  if (state === 'unsupported') {
    return <p className="text-sm text-slate-500">Ce navigateur ne permet pas les notifications. Essaie avec Chrome, Safari (iOS 16.4 ou plus récent) ou Edge.</p>;
  }
  if (state === 'denied') {
    return (
      <p className="text-sm text-slate-500">
        Les notifications sont bloquées pour Wallo. Pour les réactiver : <b className="text-slate-700">Réglages du téléphone › Notifications › Wallo</b> (sur
        ordinateur : le cadenas à gauche de l'adresse du site).
      </p>
    );
  }
  if (state === 'default') {
    return (
      <button
        onClick={() => run(enableNotifications)}
        disabled={busy}
        className="w-full py-3 rounded-2xl bg-accent hover:bg-accent-hover text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
      >
        <Bell className="w-4 h-4" /> Activer les notifications
      </button>
    );
  }

  return (
    <>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="flex items-center gap-2.5">
          {on ? <Bell className="w-4 h-4 text-slate-700" /> : <BellOff className="w-4 h-4 text-slate-400" />}
          <span className="text-sm font-semibold text-slate-800">Sur cet appareil</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={busy}
          onChange={(e) => run(e.target.checked ? enableNotifications : disableNotifications)}
          className="toggle shrink-0"
        />
      </label>
      {on && (
        <button
          onClick={() => {
            void showSystemNotification('Notifications activées', 'Wallo te préviendra ici des budgets, ristournes, dettes et invitations.', { tag: 'test' });
            setTested(true);
          }}
          className="mt-3 w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700 cursor-pointer"
        >
          {tested ? 'Envoyée : regarde en haut de l\'écran' : 'Envoyer une notification de test'}
        </button>
      )}
      {/* Rappel du soir : envoyé par le serveur, donc seulement avec un compte connecté */}
      {on && pushConfigured && daily !== undefined && (
        <label className={`flex items-center justify-between gap-3 mt-4 ${daily === null ? 'opacity-60' : 'cursor-pointer'}`}>
          <span className="flex items-start gap-2.5">
            <Moon className="w-4 h-4 text-slate-700 mt-0.5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Rappel du soir</span>
              <span className="block text-xs text-slate-400">
                {daily === null ? 'Connecte-toi (Profil) pour le recevoir.' : 'À 20 h, si tu n\'as rien noté dans la journée.'}
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={!!daily}
            disabled={daily === null || busy}
            onChange={(e) => {
              const v = e.target.checked;
              setDaily(v);
              run(() => setDailyReminder(v).catch(() => setDaily(!v)));
            }}
            className="toggle shrink-0"
          />
        </label>
      )}
    </>
  );
};
