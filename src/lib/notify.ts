// Notifications du téléphone (bannière système, comme un SMS)
// • A : l'app affiche elle-même une notification pour ce qui arrive pendant qu'elle tourne
//   (budget dépassé, annonce…), via le service worker (obligatoire sur téléphone).
// • B : notifications « push » envoyées par Supabase, même app fermée. Cet appareil s'abonne
//   avec la clé publique VAPID (VITE_VAPID_PUBLIC_KEY) et l'abonnement est rangé dans
//   la table push_subscriptions (voir supabase/migrations/20261009000000_push.sql).
import { useSyncExternalStore } from 'react';
import { getClient } from './sync/useCloud';

const KEY = 'ap.notify'; // '1' : activées sur cet appareil, '0' : coupées par la personne
const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

// unsupported : navigateur trop ancien ; install : iPhone, il faut d'abord ajouter Wallo à l'écran d'accueil
export type NotifyState = 'unsupported' | 'install' | 'default' | 'denied' | 'on' | 'off';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const readPref = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const writePref = (v: '0' | '1') => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // stockage bloqué : le réglage ne sera pas gardé
  }
};

export function notifyState(): NotifyState {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return isIOS() && !isStandalone() ? 'install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'default';
  return readPref() === '0' ? 'off' : 'on';
}

// Petit magasin pour que l'écran Paramètres suive les changements
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let snapshot = typeof window === 'undefined' ? 'unsupported' : notifyState();
const refresh = () => {
  const next = notifyState();
  if (next !== snapshot) {
    snapshot = next;
    emit();
  }
};
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refresh); // réglage changé dans le téléphone

export function useNotifyState(): NotifyState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot as NotifyState,
    () => 'unsupported' as NotifyState,
  );
}

export const notificationsOn = () => notifyState() === 'on';

// Demande l'autorisation (doit venir d'un toucher de la personne), puis abonne cet appareil au push
export async function enableNotifications(): Promise<NotifyState> {
  if (notifyState() === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') {
    writePref('1');
    await subscribePush().catch(() => {});
  }
  refresh();
  return snapshot as NotifyState;
}

export async function disableNotifications() {
  writePref('0');
  await unsubscribePush().catch(() => {});
  refresh();
}

// ---------- A : notification affichée par l'app ----------

export async function showSystemNotification(title: string, body: string, opts: { tag?: string; url?: string } = {}) {
  if (!notificationsOn()) return;
  const options: NotificationOptions & { data?: unknown } = {
    body,
    tag: opts.tag,
    icon: '/icons/icon-192.png',
    data: { url: opts.url ?? '/' },
  };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options); // ordinateur en développement (pas de service worker)
  } catch {
    // notification refusée par le système : tant pis, l'alerte reste dans l'app
  }
}

// ---------- B : abonnement push (même app fermée) ----------

export const pushConfigured = !!VAPID_PUBLIC_KEY;

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// Abonne cet appareil et l'enregistre pour le compte connecté (sans compte : rien, l'app reste en A)
export async function subscribePush() {
  if (!pushConfigured || !notificationsOn() || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  // Par une fonction : un téléphone qui change de compte ne garde que le dernier
  await sb.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent.slice(0, 200),
  });
}

// Désabonne cet appareil (notifications coupées, ou déconnexion : le téléphone ne doit plus rien recevoir)
export async function unsubscribePush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  try {
    const sb = await getClient();
    await sb.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
  } finally {
    await sub.unsubscribe();
  }
}

// ---------- Rappel du soir (20 h) : réglage du compte, envoyé par le serveur ----------

// null : pas de compte connecté (le rappel a besoin du serveur)
export async function getDailyReminder(): Promise<boolean | null> {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  const { data: row } = await sb.from('profiles').select('remind_daily').eq('id', data.session.user.id).maybeSingle();
  return !!(row as { remind_daily?: boolean } | null)?.remind_daily;
}

export async function setDailyReminder(on: boolean) {
  const sb = await getClient();
  const { error } = await sb.rpc('set_daily_reminder', { p_on: on });
  if (error) throw new Error(error.message);
}
