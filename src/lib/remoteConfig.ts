import { useSyncExternalStore } from 'react';
import { cloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { onOtherTabChange } from './crossTab';
import type { HelpArticle } from '../data/help';

// Réglages décidés depuis l'espace admin (site séparé) : fonctionnalités activées ou non,
// annonces pour tout le monde, icônes proposées à tous.
// Lus sans compte (fonction app_config de la base), gardés sur l'appareil pour le mode hors ligne.
// Base pas encore à jour ou réseau absent : on garde la dernière version connue (tout activé au départ).

export type FeatureKey = 'debts' | 'budgets' | 'ristournes' | 'sharedWallets' | 'importData' | 'accounts' | 'wrapped' | 'wrappedNow' | 'wrappedCountdown' | 'festive' | 'pro';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  kind: 'info' | 'update' | 'warning';
  createdAt: string;
}

export interface GlobalIcon {
  id: string; // « global:<uuid> » (c'est ce nom qui est enregistré dans icon)
  name: string;
  dataUrl: string;
  keepColors: boolean;
  folder: string; // dossier (Mobile Money, Banques…), voir iconFolders.ts
}

// Bannière publicitaire de l'accueil (image 4:1 + lien https facultatif)
export interface Ad {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  sponsored: boolean;
}

// Wallo Pro : ce qui est gratuit et ce qui est Pro (liste faite depuis l'espace admin)
export interface ProFeature {
  id: string;
  label: string;
  description: string;
  tier: 'free' | 'pro';
}

export interface RemoteConfig {
  features: Partial<Record<FeatureKey, boolean>>;
  announcements: Announcement[];
  icons: GlobalIcon[];
  ads: Ad[];
  help: HelpArticle[]; // articles d'aide ajoutés depuis l'espace admin
  pro: ProFeature[];
}

export const GLOBAL_PREFIX = 'global:';
const KEY = 'ap.remote';
const EMPTY: RemoteConfig = { features: {}, announcements: [], icons: [], ads: [], help: [], pro: [] };

let config: RemoteConfig = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(): RemoteConfig {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v === 'object' ? { ...EMPTY, ...v } : EMPTY;
  } catch {
    return EMPTY;
  }
}

onOtherTabChange(KEY, () => {
  config = read();
  emit();
});

const isImage = (s: unknown): s is string => typeof s === 'string' && /^data:image\/(svg\+xml|png)[;,]/.test(s);

// Réponse de la base -> objets de l'app (on ne garde que ce qui est bien formé)
function parse(raw: Record<string, unknown>): RemoteConfig {
  const features: RemoteConfig['features'] = {};
  const f = (raw.features ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(f)) if (typeof v === 'boolean') features[k as FeatureKey] = v;
  const announcements = (Array.isArray(raw.announcements) ? raw.announcements : [])
    .filter((a) => a && typeof a.id === 'string' && typeof a.title === 'string' && typeof a.message === 'string')
    .map((a) => ({ id: a.id, title: a.title, message: a.message, kind: ['update', 'warning'].includes(a.kind) ? a.kind : 'info', createdAt: String(a.created_at ?? '') }));
  const icons = (Array.isArray(raw.icons) ? raw.icons : [])
    .filter((i) => i && typeof i.id === 'string' && typeof i.name === 'string' && isImage(i.data_url))
    .map((i) => ({ id: `${GLOBAL_PREFIX}${i.id}`, name: i.name, dataUrl: i.data_url, keepColors: !!i.keep_colors, folder: typeof i.folder === 'string' && i.folder ? i.folder : 'Divers' }));
  const https = (s: unknown): s is string => typeof s === 'string' && /^https:\/\/\S+$/.test(s);
  const ads = (Array.isArray(raw.ads) ? raw.ads : [])
    .filter((a) => a && typeof a.id === 'string' && https(a.image_url))
    .map((a) => ({ id: a.id, title: String(a.title ?? ''), imageUrl: a.image_url, linkUrl: https(a.link_url) ? a.link_url : null, sponsored: a.sponsored !== false }));
  const help = (Array.isArray(raw.help) ? raw.help : [])
    .filter((h) => h && typeof h.id === 'string' && typeof h.title === 'string' && typeof h.body === 'string')
    .map((h) => ({
      id: `admin-${h.id}`,
      title: String(h.title),
      body: String(h.body),
      category: typeof h.category === 'string' && h.category ? h.category : 'Autres',
      platform: h.platform === 'iphone' || h.platform === 'android' ? h.platform : undefined,
    })) as HelpArticle[];
  const pro = (Array.isArray(raw.pro) ? raw.pro : [])
    .filter((x) => x && typeof x.id === 'string' && typeof x.label === 'string')
    .map((x) => ({ id: x.id, label: String(x.label), description: String(x.description ?? ''), tier: x.tier === 'free' ? 'free' : 'pro' })) as ProFeature[];
  return { features, announcements, icons, ads, help, pro };
}

// Vue / clic sur une bannière (compté par la base, sans savoir qui). Une vue par pub et par jour sur cet appareil.
export function adEvent(id: string, kind: 'view' | 'click') {
  if (!cloudConfigured) return;
  if (kind === 'view') {
    const key = `ap.adSeen.${id}`;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch {
      // stockage bloqué : la vue est comptée quand même
    }
  }
  // « promo_event » : les bloqueurs de pub bloquent les adresses qui contiennent « ad_ » / « /ads »
  const post = (fn: string, body: object) =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true, // le clic ouvre un autre site : l'envoi part quand même
    });
  post('promo_event', { promo: id, kind })
    .then((r) => (r.status === 404 ? post('ad_event', { ad: id, kind }) : r)) // base pas encore à jour
    .catch(() => {});
}

let last = 0;
let inFlight = false;

// Relit la config (au démarrage, puis au retour dans l'app, au plus toutes les 5 minutes)
export async function refreshRemoteConfig(force = false) {
  if (!cloudConfigured || inFlight || (!force && Date.now() - last < 5 * 60_000)) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  inFlight = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/app_config`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return; // base pas encore à jour : on garde ce qu'on a
    const next = parse(await res.json());
    last = Date.now();
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    config = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // stockage plein : la config reste pour cette session
    }
    emit();
  } catch {
    // hors ligne : on garde la dernière version connue
  } finally {
    inFlight = false;
  }
}

export function initRemoteConfig() {
  refreshRemoteConfig(true);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshRemoteConfig());
  window.addEventListener('online', () => refreshRemoteConfig(true));
}

export const getRemoteConfig = () => config;

export function useRemoteConfig(): RemoteConfig {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => config
  );
}

// Fonctionnalité disponible ? (absente de la config = oui)
export const featureOn = (c: RemoteConfig, key: FeatureKey) => c.features[key] !== false;

export function useFeature(key: FeatureKey): boolean {
  return featureOn(useRemoteConfig(), key);
}

// Interrupteur éteint par défaut (ex. « Wrapped : montrer maintenant ») : allumé seulement si l'admin l'a allumé
export function useFlag(key: FeatureKey): boolean {
  return useRemoteConfig().features[key] === true;
}

export const getGlobalIcon = (id: string) => config.icons.find((i) => i.id === id);
