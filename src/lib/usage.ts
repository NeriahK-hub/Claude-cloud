import { cloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { dayKey } from './insights';

// Compteur anonyme de ce qui sert (page « Usage » de l'espace admin, supabase/migrations/20261017000000_usage.sql).
// Rien sur la personne : seulement « tel outil ouvert aujourd'hui sur cet appareil », une fois par jour au plus.
// Hors ligne : la liste attend sur le téléphone et part au retour du réseau.

export type UsageKey =
  | 'open'
  | 'mode.simple'
  | 'mode.icons'
  | 'mode.festiveOff'
  | 'home.health'
  | 'home.badges'
  | 'home.calendar'
  | 'home.month'
  | 'home.week'
  | 'home.wrapped'
  | 'home.festive'
  | `tool.${string}`
  | 'share.badge'
  | 'share.week'
  | 'share.year'
  | 'share.report'
  | 'qr.show'
  | 'qr.scan'
  | 'coach.done'
  | 'coach.skip';

const SEEN = 'ap.usageSeen'; // { day, keys } : déjà compté aujourd'hui
const QUEUE = 'ap.usageQueue'; // { [jour]: clés } : pas encore envoyé

type Seen = { day: string; keys: string[] };

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v && typeof v === 'object' ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage plein ou bloqué : on ne compte pas, tant pis */
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

export function track(key: UsageKey) {
  if (!cloudConfigured) return;
  const day = dayKey(new Date());
  const seen = readJson<Seen>(SEEN, { day, keys: [] });
  const keys = seen.day === day ? seen.keys : [];
  if (keys.includes(key)) return;
  writeJson(SEEN, { day, keys: [...keys, key] });
  const queue = readJson<Record<string, string[]>>(QUEUE, {});
  queue[day] = [...(queue[day] ?? []), key];
  writeJson(QUEUE, queue);
  clearTimeout(timer);
  timer = setTimeout(flushUsage, 4000); // on regroupe les ouvertures proches en un seul envoi
}

let sending = false;
export async function flushUsage() {
  if (sending || !cloudConfigured || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const queue = readJson<Record<string, string[]>>(QUEUE, {});
  const days = Object.keys(queue);
  if (!days.length) return;
  sending = true;
  try {
    for (const day of days) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/track_usage`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_features: queue[day], p_day: day }),
        keepalive: true,
      });
      // Envoyé, ou base pas encore à jour (404) : on vide pour ne pas accumuler
      if (res.ok || res.status === 404) delete queue[day];
    }
  } catch {
    // réseau coupé : on réessaiera
  } finally {
    // Pas plus d'une semaine en attente
    const cutoff = dayKey(new Date(Date.now() - 7 * 86_400_000));
    for (const d of Object.keys(queue)) if (d < cutoff) delete queue[d];
    if (Object.keys(queue).length) writeJson(QUEUE, queue);
    else {
      try {
        localStorage.removeItem(QUEUE);
      } catch {
        /* rien */
      }
    }
    sending = false;
  }
}

export function initUsage(modes: { simple: boolean; icons: boolean; festiveOff: boolean }) {
  track('open');
  if (modes.simple) track('mode.simple');
  if (modes.icons) track('mode.icons');
  if (modes.festiveOff) track('mode.festiveOff');
  window.addEventListener('online', () => flushUsage());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushUsage());
}
