// Accès à la base pour l'espace admin. Toujours la clé PUBLIQUE : ce sont les règles de la base
// (fonctions admin_*, table admins) qui décident. Jamais de clé service_role ici.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../src/lib/config';

export const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const sb = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'x', {
  // pkce : le lien reçu par e-mail revient avec ?code=… (le # de l'adresse reste aux onglets de l'admin)
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'wallo-admin-auth' },
});

const check = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export interface FeedbackRow {
  id: string;
  mood: number | null;
  kind: 'idea' | 'problem' | 'other';
  message: string;
  app_version: string | null;
  device: string | null;
  status: 'new' | 'read' | 'done';
  created_at: string;
  email: string | null;
}

export interface Stats {
  users: number;
  users_new_7d: number;
  users_new_30d: number;
  active_7d: number;
  active_30d: number;
  banned: number;
  wallets: number;
  shared_wallets: number;
  transactions: number;
  transactions_30d: number;
  ristournes: number;
  signups_by_day: { day: string; n: number }[];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  is_admin: boolean;
  wallets: number;
  transactions: number;
  last_activity: string | null;
}

export interface Feature {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  updated_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  kind: 'info' | 'update' | 'warning';
  active: boolean;
  expires_at: string | null;
  created_at: string;
  push?: boolean; // envoyée aussi en notification push (colonne ajoutée par 20261009000000_push.sql)
}

export interface HelpRow {
  id: string;
  title: string;
  body: string;
  category: string;
  platform: 'iphone' | 'android' | null;
  active: boolean;
  created_at: string;
}

export interface GlobalIconRow {
  id: string;
  name: string;
  folder?: string;
  data_url: string;
  keep_colors: boolean;
  created_at: string;
}

export interface AdRow {
  id: string;
  title: string;
  image_url: string;
  link_url: string | null;
  sponsored: boolean;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  sort_order: number;
  views: number;
  clicks: number;
  created_at: string;
}

export interface MarketRate {
  day: string; // AAAA-MM-JJ
  usd_cdf: number;
}

// Compteur anonyme (supabase/migrations/20261017000000_usage.sql) : appareils par outil
export interface UsageRow {
  feature: string;
  last7: number | null;
  prev7: number | null;
  total: number;
  last_day: string;
}

const BUCKET = 'visuals'; // nom neutre : « banners » est bloqué par les bloqueurs de pub

export const api = {
  isAdmin: async () => check(await sb.rpc('is_admin')) as boolean,
  stats: async () => check(await sb.rpc('admin_stats')) as Stats,
  users: async (search: string, off = 0) => (check(await sb.rpc('admin_list_users', { search, lim: 50, off })) ?? []) as AdminUser[],
  setBanned: async (target: string, ban: boolean) => void check(await sb.rpc('admin_set_banned', { target, ban })),
  deleteUser: async (target: string) => void check(await sb.rpc('admin_delete_user', { target })),

  features: async () => (check(await sb.from('app_features').select('*').order('label')) ?? []) as Feature[],
  setFeature: async (key: string, enabled: boolean) => void check(await sb.from('app_features').update({ enabled }).eq('key', key)),

  announcements: async () => (check(await sb.from('announcements').select('*').order('created_at', { ascending: false })) ?? []) as Announcement[],
  addAnnouncement: async (a: Pick<Announcement, 'title' | 'message' | 'kind' | 'expires_at' | 'push'>) => void check(await sb.from('announcements').insert(a)),
  setAnnouncementActive: async (id: string, active: boolean) => void check(await sb.from('announcements').update({ active }).eq('id', id)),
  deleteAnnouncement: async (id: string) => void check(await sb.from('announcements').delete().eq('id', id)),

  helpArticles: async () => (check(await sb.from('help_articles').select('*').order('created_at', { ascending: false })) ?? []) as HelpRow[],
  addHelp: async (a: Pick<HelpRow, 'title' | 'body' | 'category' | 'platform'>) => void check(await sb.from('help_articles').insert(a)),
  setHelpActive: async (id: string, active: boolean) => void check(await sb.from('help_articles').update({ active }).eq('id', id)),
  deleteHelp: async (id: string) => void check(await sb.from('help_articles').delete().eq('id', id)),

  icons: async () => (check(await sb.from('global_icons').select('*').order('sort_order').order('created_at')) ?? []) as GlobalIconRow[],
  addIcon: async (name: string, data_url: string, keep_colors: boolean, folder: string) => void check(await sb.from('global_icons').insert({ name, data_url, keep_colors, folder })),
  setIconFolder: async (id: string, folder: string) => void check(await sb.from('global_icons').update({ folder }).eq('id', id)),
  deleteIcon: async (id: string) => void check(await sb.from('global_icons').delete().eq('id', id)),

  // Pubs : toujours par des fonctions « promo » (les bloqueurs de pub bloquent les adresses en « /ads »)
  // Taux du marché (cambistes) : un par jour, lu par l'app (fonction market_rates)
  feedback: async (status?: FeedbackRow['status']) => (check(await sb.rpc('admin_feedback', { p_status: status ?? null })) ?? []) as FeedbackRow[],
  setFeedbackStatus: async (id: string, status: FeedbackRow['status']) => void check(await sb.rpc('admin_feedback_set_status', { p_id: id, p_status: status })),
  deleteFeedback: async (id: string) => void check(await sb.rpc('admin_feedback_delete', { p_id: id })),

  usage: async (days = 30) => (check(await sb.rpc('admin_usage', { p_days: days })) ?? []) as UsageRow[],

  marketRates: async () => (check(await sb.rpc('market_rates')) ?? []) as MarketRate[],
  setMarketRate: async (day: string, rate: number) => void check(await sb.rpc('admin_set_market_rate', { p_day: day, p_rate: rate })),
  deleteMarketRate: async (day: string) => void check(await sb.rpc('admin_delete_market_rate', { p_day: day })),

  ads: async () => (check(await sb.rpc('admin_promos')) ?? []) as AdRow[],
  // Image envoyée dans le dossier public « visuals », puis la pub est créée avec son adresse
  addAd: async (image: Blob | string, ad: Pick<AdRow, 'title' | 'link_url' | 'sponsored' | 'starts_at' | 'expires_at'>) => {
    const create = (image_url: string) =>
      sb.rpc('admin_promo_create', {
        p_title: ad.title,
        p_image_url: image_url,
        p_link_url: ad.link_url,
        p_sponsored: ad.sponsored,
        p_starts_at: ad.starts_at,
        p_expires_at: ad.expires_at,
      });
    // Lien d'une image déjà en ligne : rien à envoyer
    if (typeof image === 'string') return void check(await create(image));
    const ext = image.type === 'image/webp' ? 'webp' : image.type === 'image/png' ? 'png' : 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    check(await sb.storage.from(BUCKET).upload(path, image, { contentType: image.type, cacheControl: '31536000', upsert: false }));
    const image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    try {
      check(await create(image_url));
    } catch (e) {
      await sb.storage.from(BUCKET).remove([path]); // pas de pub : on ne garde pas l'image
      throw e;
    }
  },
  setAdActive: async (id: string, active: boolean) => void check(await sb.rpc('admin_promo_set_active', { target: id, is_active: active })),
  deleteAd: async (ad: AdRow) => {
    check(await sb.rpc('admin_promo_delete', { target: ad.id }));
    // Seulement les images envoyées dans nos dossiers (pas celles données par un lien)
    for (const bucket of [BUCKET, 'banners']) {
      const mine = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
      if (ad.image_url.startsWith(mine)) await sb.storage.from(bucket).remove([decodeURIComponent(ad.image_url.slice(mine.length))]);
    }
  },
};

// Messages d'erreur de la base en français lisible
export function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/Could not find the function|schema cache|does not exist/i.test(m)) return "La base n'est pas à jour : exécute les dernières migrations (dossier supabase/migrations) dans Supabase.";
  if (/Bucket not found/i.test(m)) return "Le dossier d'images n'existe pas : exécute la migration 20261003000000_ads.sql dans Supabase.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m))
    return navigator.onLine
      ? 'Requête bloquée par le navigateur. Si tu as un bloqueur de pub (AdBlock, uBlock…), mets wallo-admin.web.app en liste blanche.'
      : 'Pas de connexion internet.';
  return m;
}
