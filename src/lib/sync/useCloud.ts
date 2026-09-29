import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { migrateIds, runSync, SyncMeta, SyncPatch } from './engine';
import type { SyncData } from './mapping';
import { supabaseRemote } from './supabaseRemote';

// Compte en ligne + synchro automatique.
// Sans compte (ou sans clés Supabase), l'app marche comme avant, uniquement sur le téléphone.

export type CloudStatus =
  | 'unconfigured' // clés Supabase absentes
  | 'loading'
  | 'signed-out'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'
  | 'needs-decision'; // 1re connexion : téléphone et compte ont tous deux des données

export interface CloudUser {
  id: string;
  email: string;
}

const META_KEY = 'ap.sync.meta';
const readMeta = (): SyncMeta | null => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const writeMeta = (m: SyncMeta | null) => {
  try {
    if (m) localStorage.setItem(META_KEY, JSON.stringify(m));
    else localStorage.removeItem(META_KEY);
  } catch {
    // stockage plein : la prochaine synchro renverra un peu plus que nécessaire
  }
};

// Client Supabase chargé seulement si on s'en sert (garde l'app légère)
let clientPromise: Promise<SupabaseClient> | null = null;
export function getClient(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  );
  return clientPromise;
}

interface UseCloudArgs {
  getLocal: () => SyncData;
  replaceLocal: (d: SyncData, idMap: Record<string, string>) => void; // identifiants convertis (une fois)
  applyPatch: (p: SyncPatch) => void;
  clearLocal: () => void; // déconnexion : on efface les données de cet appareil
  changeKey: unknown; // change à chaque modification locale
}

const isNetworkError = (e: unknown) => e instanceof TypeError || /fetch|network|Failed to/i.test(String((e as Error)?.message ?? e));

export function useCloud({ getLocal, replaceLocal, applyPatch, clearLocal, changeKey }: UseCloudArgs) {
  const [status, setStatus] = useState<CloudStatus>(cloudConfigured ? 'loading' : 'unconfigured');
  const [user, setUser] = useState<CloudUser | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [remoteWallets, setRemoteWallets] = useState(0);
  const running = useRef(false);
  const again = useRef(false);
  const skipChange = useRef(false);
  const userRef = useRef<CloudUser | null>(null);
  userRef.current = user;
  const fns = useRef({ getLocal, replaceLocal, applyPatch, clearLocal });
  fns.current = { getLocal, replaceLocal, applyPatch, clearLocal };

  const sync = useCallback(async (decision?: 'merge' | 'replace') => {
    const u = userRef.current;
    if (!u) return;
    if (running.current) {
      again.current = true; // une modification pendant la synchro : on refera un tour
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline');
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      const sb = await getClient();
      // Une fois : les anciens identifiants deviennent des UUID avant le premier envoi
      const { data, map } = migrateIds(fns.current.getLocal());
      if (Object.keys(map).length) fns.current.replaceLocal(data, map);
      const res = await runSync(() => fns.current.getLocal(), readMeta(), supabaseRemote(sb, u.id), decision);
      if (res.status === 'needs-decision') {
        setRemoteWallets(res.remoteWallets);
        setStatus('needs-decision');
        return;
      }
      const p = res.patch;
      if (p.replaceAll || p.wallets || p.transactions || p.categories || p.budgets || p.customIcons || p.settings || p.profileName !== undefined) {
        skipChange.current = true; // ce changement vient de la base : pas besoin de le renvoyer
        fns.current.applyPatch(p);
      }
      writeMeta(res.meta);
      setLastSync(new Date());
      setError('');
      setStatus('synced');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(isNetworkError(e) ? 'offline' : 'error');
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(() => sync(), 500);
      }
    }
  }, []);

  // Session : au démarrage, au retour d'un lien de connexion, à la déconnexion
  useEffect(() => {
    if (!cloudConfigured) return;
    let unsub: (() => void) | undefined;
    getClient().then(async (sb) => {
      const { data } = await sb.auth.getSession();
      const s = data.session;
      setUser(s ? { id: s.user.id, email: s.user.email ?? '' } : null);
      if (!s) setStatus('signed-out');
      const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
        setUser((old) => {
          const next = session ? { id: session.user.id, email: session.user.email ?? '' } : null;
          return old?.id === next?.id ? old : next;
        });
        if (!session) setStatus('signed-out');
      });
      unsub = () => sub.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, []);

  // Connecté : synchro tout de suite, puis toutes les minutes, au retour du réseau et de l'app
  useEffect(() => {
    if (!user) return;
    sync();
    const tick = setInterval(() => document.visibilityState === 'visible' && sync(), 60_000);
    const onOnline = () => sync();
    const onVisible = () => document.visibilityState === 'visible' && sync();
    const onOffline = () => setStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    // Temps réel : un membre modifie un portefeuille partagé -> on récupère tout de suite
    let debounce: ReturnType<typeof setTimeout>;
    let channel: { unsubscribe: () => unknown } | undefined;
    getClient().then((sb) => {
      const ch = sb.channel('wallo-sync');
      for (const table of ['wallets', 'wallet_members', 'transactions']) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => sync(), 800);
        });
      }
      channel = ch.subscribe();
    });
    return () => {
      clearInterval(tick);
      clearTimeout(debounce);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      channel?.unsubscribe();
    };
  }, [user, sync]);

  // Modification locale : envoi 2,5 s après la dernière (regroupe les saisies rapides)
  useEffect(() => {
    if (!userRef.current) return;
    if (skipChange.current) {
      skipChange.current = false;
      return;
    }
    const t = setTimeout(() => sync(), 2500);
    return () => clearTimeout(t);
  }, [changeKey, sync]);

  // ---------- Connexion ----------
  const sendCode = async (email: string) => {
    const sb = await getClient();
    const { error: e } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } });
    if (e) throw new Error(e.message);
  };
  const verifyCode = async (email: string, code: string) => {
    const sb = await getClient();
    const { error: e } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (e) throw new Error(e.message);
  };
  const signInWithGoogle = async () => {
    const sb = await getClient();
    // Vérifie avant de quitter l'app : sinon Supabase affiche une page d'erreur brute
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
      const settings = res.ok ? await res.json() : null;
      if (settings?.external && !settings.external.google) throw new Error('Unsupported provider: provider is not enabled');
    } catch (err) {
      if (err instanceof Error && /provider is not enabled/.test(err.message)) throw err;
      // hors ligne ou réponse inattendue : on tente quand même
    }
    const { error: e } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (e) throw new Error(e.message);
  };
  const signOut = async () => {
    await sync(); // dernier envoi si possible
    const sb = await getClient();
    await sb.auth.signOut();
    writeMeta(null);
    fns.current.clearLocal();
    setUser(null);
    setStatus('signed-out');
  };

  return {
    configured: cloudConfigured,
    status,
    user,
    lastSync,
    error,
    remoteWallets,
    syncNow: () => sync(),
    decide: (d: 'merge' | 'replace') => sync(d),
    sendCode,
    verifyCode,
    signInWithGoogle,
    signOut,
  };
}

export type Cloud = ReturnType<typeof useCloud>;
