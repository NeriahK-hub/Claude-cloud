import { cloudConfigured } from './config';

// « Donner mon avis » : l'avis est gardé sur le téléphone, puis envoyé dès qu'il y a du réseau
// (fonction send_feedback de supabase/migrations/20261013000000_feedback.sql).

export type FeedbackKind = 'idea' | 'problem' | 'other';
export interface FeedbackItem {
  mood: number | null; // 1 … 5
  kind: FeedbackKind;
  message: string;
  device: string;
  at: string;
}

const KEY = 'ap.feedbackQueue';
const APP_VERSION = '2026.10';

const readQueue = (): FeedbackItem[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeQueue = (q: FeedbackItem[]) => {
  try {
    if (q.length) localStorage.setItem(KEY, JSON.stringify(q.slice(-20)));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
};

let sending = false;
export async function flushFeedback(): Promise<boolean> {
  if (sending || !cloudConfigured || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;
  const q = readQueue();
  if (!q.length) return true;
  sending = true;
  try {
    const { getClient } = await import('./sync/useCloud');
    const sb = await getClient();
    const left: FeedbackItem[] = [];
    for (const f of q) {
      const { error } = await sb.rpc('send_feedback', { p_mood: f.mood, p_kind: f.kind, p_message: f.message, p_app: APP_VERSION, p_device: f.device });
      // Erreur réseau : on réessaiera ; erreur de la base (ex. migration absente) : on garde aussi
      if (error) left.push(f);
    }
    writeQueue(left);
    return left.length === 0;
  } catch {
    return false;
  } finally {
    sending = false;
  }
}

// Ajoute l'avis à la file et tente de l'envoyer tout de suite. true = parti, false = en attente du réseau
export async function sendFeedback(f: Omit<FeedbackItem, 'device' | 'at'>): Promise<boolean> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  const device = `${standalone ? 'App installée' : 'Navigateur'} · ${window.innerWidth}×${window.innerHeight} · ${ua}`.slice(0, 200);
  writeQueue([...readQueue(), { ...f, device, at: new Date().toISOString() }]);
  return flushFeedback();
}

// Au démarrage et au retour du réseau : on envoie ce qui attend
export function installFeedbackSync() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => void flushFeedback());
  setTimeout(() => void flushFeedback(), 8000);
}
