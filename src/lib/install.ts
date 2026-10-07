import { useSyncExternalStore } from 'react';

// Installer Wallo sur l'écran d'accueil.
// • Android / Chrome / Edge : le navigateur propose sa fenêtre « Installer » (événement beforeinstallprompt,
//   gardé ici dès le démarrage pour pouvoir l'ouvrir au bon moment)
// • iPhone / iPad (Safari, et Chrome depuis iOS 16.4) : pas de fenêtre automatique, on montre les gestes
// • Navigateur intégré (WhatsApp, Facebook, Instagram…) : impossible d'installer, il faut ouvrir la page
//   dans Safari ou Chrome

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallWay = 'installed' | 'prompt' | 'ios' | 'inapp' | 'android' | 'desktop';

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const ua = () => navigator.userAgent;
const isIOS = () => /iPad|iPhone|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/i.test(ua());
// Navigateurs intégrés aux applis (ils ne savent pas installer une app web)
const isInApp = () => /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Snapchat|TikTok|musical_ly|Line\/|MicroMessenger|; wv\)/i.test(ua());

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // on garde la fenêtre pour notre bouton « Installer »
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function installWay(): InstallWay {
  if (installed || isStandalone()) return 'installed';
  if (isInApp()) return 'inapp';
  if (deferred) return 'prompt';
  if (isAndroid()) return 'android'; // avant iOS : un Android peut se dire « MacIntel » avec écran tactile
  if (isIOS()) return 'ios';
  return 'desktop';
}

export function useInstallWay(): InstallWay {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    installWay
  );
}

// Ouvre la fenêtre « Installer » du navigateur ; true si la personne a accepté
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === 'accepted';
}

// Proposé une seule fois automatiquement (après le tutoriel) ; ensuite depuis le Profil
const ASKED = 'ap.installAsked';
export const installAsked = () => {
  try {
    return localStorage.getItem(ASKED) === '1';
  } catch {
    return true;
  }
};
export const markInstallAsked = () => {
  try {
    localStorage.setItem(ASKED, '1');
  } catch {
    /* rien */
  }
};
// À proposer tout de suite ? (téléphone, pas encore installé, jamais proposé)
export const shouldOfferInstall = () => !installAsked() && !['installed', 'desktop'].includes(installWay());
