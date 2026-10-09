import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deviceKey, deviceName, DeviceRow } from '../devices';
import { cloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { idsOf, keepLocalEdits, migrateIds, runSync, SyncMeta, SyncPatch } from './engine';
import type { SyncData } from './mapping';
import { supabaseRemote } from './supabaseRemote';
import { pushPrefs, reconcilePrefs } from './cloudPrefs';
import { onPrefsChanged } from '../prefsStamp';
import { isUuid } from '../ids';

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

// Ce que dit un code d'invitation (fonctions wallet_invite_check / join_wallet de la base)
export interface InviteInfo {
  status: 'ok' | 'joined' | 'owner' | 'already' | 'expired' | 'invalid' | 'blocked';
  code?: string;
  wallet_id?: string;
  wallet_name?: string;
  owner_name?: string;
  members?: number;
}

// Ce que dit un code d'invitation de ristourne (ristourne_invite_check / join_ristourne)
export interface RistourneInviteInfo {
  status: InviteInfo['status'];
  code?: string;
  ristourne_id?: string;
  ristourne_name?: string;
  owner_name?: string;
  contribution?: number;
  currency?: string;
  frequency?: string;
  every_days?: number | null;
  members?: number;
  slots?: { id: string; name: string; turn: number }[]; // places notées par leur nom, sans compte
}

// Ce que dit un code de dette partagée (debt_invite_check / join_debt / decline_debt)
export interface DebtInviteInfo {
  status: InviteInfo['status'] | 'taken' | 'declined';
  code?: string;
  share_id?: string;
  owner_name?: string;
  guest_side?: 'receivable' | 'payable'; // MON côté si j'accepte (receivable = on me doit)
  moves?: { kind: 'more' | 'repay' | 'interest'; amount: number; currency: string; occurred_at: string; note: string | null }[];
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
  // État du réseau, pour l'affichage (nuages de l'en-tête) : rien ici ne change la synchro elle-même
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [slow, setSlow] = useState(false); // réseau très lent (2G), quand le téléphone le dit
  const [back, setBack] = useState(false); // le réseau vient de revenir et tout est envoyé (quelques secondes)
  const wasOffline = useRef(false);
  // Modifications faites ici et pas encore envoyées (gardé si l'app est fermée hors ligne)
  const [pending, setPendingState] = useState(() => {
    try {
      return Number(localStorage.getItem('ap.syncPending')) || 0;
    } catch {
      return 0;
    }
  });
  const setPending = useCallback((f: (n: number) => number) => {
    setPendingState((n) => {
      const v = Math.max(0, f(n));
      try {
        localStorage.setItem('ap.syncPending', String(v));
      } catch {
        /* stockage indisponible : l'affichage seulement */
      }
      return v;
    });
  }, []);
  const running = useRef(false);
  const again = useRef(false);
  const skipChange = useRef(false);
  const refetchShared = useRef(false); // on vient de rejoindre un portefeuille : tout relire
  const userRef = useRef<CloudUser | null>(null);
  userRef.current = user;
  const fns = useRef({ getLocal, replaceLocal, applyPatch, clearLocal });
  fns.current = { getLocal, replaceLocal, applyPatch, clearLocal };
  // Tout ce que cet onglet a eu dans ses données depuis son ouverture : il ne peut supprimer
  // en ligne que ça (voir engine.ts > push). Protège d'un 2e onglet resté sur une vieille version.
  const known = useRef<Set<string> | null>(null);
  if (!known.current) known.current = new Set(idsOf(getLocal()));
  const remember = (d: SyncData) => idsOf(d).forEach((id) => known.current!.add(id));

  const sync = useCallback(async (decision?: 'merge' | 'replace') => {
    const u = userRef.current;
    if (!u) return;
    if (running.current) {
      again.current = true; // une modification pendant la synchro : on refera un tour
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      wasOffline.current = true;
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
      remember(data);
      let seen: SyncData | undefined; // données lues pour la réception (dernier appel)
      const read = () => (seen = fns.current.getLocal());
      const refetch = refetchShared.current;
      const res = await runSync(read, readMeta(), supabaseRemote(sb, u.id), decision, refetch, known.current!);
      if (res.status === 'needs-decision') {
        setRemoteWallets(res.remoteWallets);
        setStatus('needs-decision');
        return;
      }
      const p = res.patch;
      // Modifié ici pendant la synchro : on garde la version d'ici et on refait un tour
      if (seen && keepLocalEdits(p, res.meta, seen, fns.current.getLocal())) again.current = true;
      // (ristournes et dettes partagées comprises : un paiement noté par un autre membre doit arriver)
      if (p.replaceAll || p.wallets || p.transactions || p.categories || p.budgets || p.recurrings || p.customIcons || p.ristournes || p.debtShares || p.settings || p.profileName !== undefined) {
        skipChange.current = true; // ce changement vient de la base : pas besoin de le renvoyer
        fns.current.applyPatch(p);
      }
      // Reçu de la base : désormais connu ici
      for (const list of [p.wallets, p.transactions, p.categories, p.budgets, p.recurrings, p.customIcons, p.ristournes, p.debtShares])
        list?.upsert.forEach((x: { id: string }) => known.current!.add(x.id));
      p.wallets?.upsert.forEach((w) => w.members?.forEach((m) => known.current!.add(m.id)));
      p.ristournes?.upsert.forEach((r) => [...r.members, ...r.payments].forEach((x) => known.current!.add(x.id)));
      p.debtShares?.upsert.forEach((s) => s.moves.forEach((m) => known.current!.add(m.id)));
      if (res.heal) again.current = true; // une opération manquait d'un côté : on répare tout de suite
      writeMeta(res.meta);
      if (refetch) refetchShared.current = false;
      // Réglages de l'appareil (thème, couleur, affichage…) : gardés aussi dans le compte
      await reconcilePrefs(sb).catch(() => {});
      setLastSync(new Date());
      setError('');
      setStatus('synced');
      setPending(() => 0);
      if (wasOffline.current) {
        wasOffline.current = false;
        setBack(true);
        setTimeout(() => setBack(false), 4000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (isNetworkError(e)) wasOffline.current = true;
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

  // Réseau (avec ou sans compte) : en ligne / hors ligne, réseau lent
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => {
      wasOffline.current = true;
      setOnline(false);
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const conn = (navigator as Navigator & { connection?: EventTarget & { effectiveType?: string } }).connection;
    const check = () => setSlow(!!conn && /(^|-)2g$/.test(conn.effectiveType ?? ''));
    check();
    conn?.addEventListener?.('change', check);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      conn?.removeEventListener?.('change', check);
    };
  }, []);

  // Ce qui est partagé ici : seul ça a besoin du temps réel (le reste ne change que depuis mes appareils)
  const [shared, setShared] = useState(() => sharedKey(getLocal()));
  useEffect(() => {
    const next = sharedKey(fns.current.getLocal());
    setShared((old) => (old === next ? old : next));
  }, [changeKey, lastSync]);

  // Connecté : synchro tout de suite, puis toutes les 3 minutes (coup d'œil sync_check : 1 seul appel
  // si rien n'a changé), au retour du réseau et de l'app ; tout de suite si un partage bouge (temps réel)
  useEffect(() => {
    if (!user) return;
    sync();
    const tick = setInterval(() => document.visibilityState === 'visible' && sync(), 3 * 60_000);
    const onOnline = () => sync();
    const onVisible = () => document.visibilityState === 'visible' && sync();
    const onOffline = () => setStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(tick);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, sync]);

  // Temps réel, seulement pour ce qui est partagé (filtré par identifiant) : un membre modifie un portefeuille
  // partagé ou une dette suivie à deux -> on récupère tout de suite. Sans partage : aucune écoute
  // (avec des milliers de personnes, écouter toutes les opérations de tout le monde coûterait trop cher).
  useEffect(() => {
    if (!user) return;
    const [wallets, debts] = JSON.parse(shared) as [string[], string[]];
    if (!wallets.length && !debts.length) return;
    let debounce: ReturnType<typeof setTimeout>;
    let channel: { unsubscribe: () => unknown } | undefined;
    let stop = false;
    const list = (ids: string[]) => `in.(${ids.slice(0, 100).join(',')})`;
    getClient().then((sb) => {
      if (stop) return;
      const ch = sb.channel('wallo-sync');
      const on = (table: string, filter: string) =>
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => sync(), 800);
        });
      if (wallets.length) {
        on('wallets', `id=${list(wallets)}`);
        on('wallet_members', `wallet_id=${list(wallets)}`);
        on('transactions', `wallet_id=${list(wallets)}`);
      }
      if (debts.length) {
        on('debt_shares', `id=${list(debts)}`);
        on('debt_moves', `share_id=${list(debts)}`);
      }
      channel = ch.subscribe();
    });
    return () => {
      stop = true;
      clearTimeout(debounce);
      channel?.unsubscribe();
    };
  }, [user, shared, sync]);

  // Réglage changé ici (thème, couleur, affichage…) : envoyé au compte peu après
  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout>;
    const off = onPrefsChanged(() => {
      clearTimeout(t);
      t = setTimeout(() => getClient().then(pushPrefs).catch(() => {}), 1500);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, [user]);

  // Modification locale : envoi 2,5 s après la dernière (regroupe les saisies rapides)
  useEffect(() => {
    remember(fns.current.getLocal()); // ajouts faits ici (ou reçus d'un autre onglet) : connus
    if (!userRef.current) return;
    if (skipChange.current) {
      skipChange.current = false;
      return;
    }
    setPending((n) => n + 1);
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
    // Ce téléphone ne doit plus recevoir les notifications push de ce compte
    await import('../notify').then((m) => m.unsubscribePush()).catch(() => {});
    const sb = await getClient();
    await sb.auth.signOut();
    writeMeta(null);
    fns.current.clearLocal();
    setUser(null);
    setStatus('signed-out');
  };
  // Supprime le compte et toutes ses données en ligne, puis vide cet appareil
  const deleteAccount = async () => {
    const sb = await getClient();
    const { error: e } = await sb.rpc('delete_my_account');
    if (e) throw new Error(e.message);
    await import('../notify').then((m) => m.unsubscribePush()).catch(() => {});
    await sb.auth.signOut({ scope: 'local' });
    writeMeta(null);
    fns.current.clearLocal();
    setUser(null);
    setStatus('signed-out');
  };

  // ---------- Appareils connectés ----------
  // Cet appareil se déclare (au plus une fois par 20 minutes) ; la liste vient du compte.
  const registerDevice = async () => {
    try {
      const last = Number(localStorage.getItem('ap.deviceSeen') ?? 0);
      const name = deviceName();
      // Le nom change tout de suite si l'appareil n'est plus décrit pareil (ex. mode mobile des outils du navigateur coupé)
      if (Date.now() - last < 20 * 60_000 && localStorage.getItem('ap.deviceName') === name) return;
      const sb = await getClient();
      await sb.rpc('register_device', { p_key: deviceKey(), p_name: name });
      localStorage.setItem('ap.deviceSeen', String(Date.now()));
      localStorage.setItem('ap.deviceName', name);
    } catch {
      // pas grave : la liste d'appareils est un confort (migration pas encore passée, hors ligne…)
    }
  };
  // Connecté : cet appareil apparaît dans la liste des appareils du compte
  useEffect(() => {
    if (user) void registerDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const listDevices = async (): Promise<DeviceRow[]> => {
    await registerDevice();
    const sb = await getClient();
    const { data, error: e } = await sb.rpc('my_devices');
    if (e) throw new Error(e.message);
    return (data ?? []) as DeviceRow[];
  };
  const forgetDevice = async (id: string) => {
    const sb = await getClient();
    const { error: e } = await sb.rpc('forget_device', { p_id: id });
    if (e) throw new Error(e.message);
  };
  // Tous les autres appareils sont déconnectés (celui-ci reste connecté)
  const signOutOthers = async () => {
    const sb = await getClient();
    const { error: e } = await sb.auth.signOut({ scope: 'others' });
    if (e) throw new Error(e.message);
  };

  // ---------- Invitation par lien ----------
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const sb = await getClient();
    const { data, error: e } = await sb.rpc(fn, args);
    if (e) throw new Error(e.message);
    return data as T;
  };
  // Code du portefeuille (le même tant qu'il est valable). Un portefeuille tout juste créé
  // n'est peut-être pas encore en ligne : on synchronise puis on réessaie une fois.
  const createInvite = async (walletId: string) => {
    try {
      return await rpc<{ code: string; expires_at: string }>('create_wallet_invite', { w: walletId });
    } catch (e) {
      if (!/propriétaire/.test(String((e as Error).message))) throw e;
      await sync();
      return rpc<{ code: string; expires_at: string }>('create_wallet_invite', { w: walletId });
    }
  };
  const revokeInvites = (walletId: string) => rpc<void>('revoke_wallet_invites', { w: walletId });
  const checkInvite = (code: string) => rpc<InviteInfo>('wallet_invite_check', { invite_code: code });
  // Ristournes : mêmes invitations par lien (/t/CODE)
  const createRistourneInvite = async (ristourneId: string) => {
    try {
      return await rpc<{ code: string; expires_at: string }>('create_ristourne_invite', { r: ristourneId });
    } catch (e) {
      if (!/propriétaire/.test(String((e as Error).message))) throw e;
      await sync(); // ristourne toute neuve, pas encore en ligne
      return rpc<{ code: string; expires_at: string }>('create_ristourne_invite', { r: ristourneId });
    }
  };
  const revokeRistourneInvites = (ristourneId: string) => rpc<void>('revoke_ristourne_invites', { r: ristourneId });
  const checkRistourneInvite = (code: string) => rpc<RistourneInviteInfo>('ristourne_invite_check', { invite_code: code });
  const joinRistourne = async (code: string, name: string, claim: string | null) => {
    const info = await rpc<RistourneInviteInfo>('join_ristourne', { invite_code: code, member_name: name, claim });
    if (info.status === 'joined') {
      refetchShared.current = true;
      await sync();
    }
    return info;
  };
  // Dettes partagées : lien /d/CODE
  const createDebtInvite = async (shareId: string) => {
    try {
      return await rpc<{ code: string; expires_at: string }>('create_debt_invite', { s: shareId });
    } catch (e) {
      if (!/propriétaire/.test(String((e as Error).message))) throw e;
      await sync(); // dette toute neuve, pas encore en ligne
      return rpc<{ code: string; expires_at: string }>('create_debt_invite', { s: shareId });
    }
  };
  const revokeDebtInvites = (shareId: string) => rpc<void>('revoke_debt_invites', { s: shareId });
  const checkDebtInvite = (code: string) => rpc<DebtInviteInfo>('debt_invite_check', { invite_code: code });
  const joinDebt = async (code: string, label: string) => {
    const info = await rpc<DebtInviteInfo>('join_debt', { invite_code: code, label });
    if (info.status === 'joined') {
      refetchShared.current = true;
      await sync();
    }
    return info;
  };
  const declineDebt = (code: string) => rpc<DebtInviteInfo>('decline_debt', { invite_code: code });
  const joinWallet = async (code: string, name: string) => {
    const info = await rpc<InviteInfo>('join_wallet', { invite_code: code, member_name: name });
    if (info.status === 'joined') {
      refetchShared.current = true;
      await sync();
    }
    return info;
  };

  return {
    configured: cloudConfigured,
    status,
    user,
    lastSync,
    error,
    remoteWallets,
    online,
    slow,
    back,
    pending,
    syncNow: () => sync(),
    decide: (d: 'merge' | 'replace') => sync(d),
    sendCode,
    verifyCode,
    signInWithGoogle,
    signOut,
    deleteAccount,
    listDevices,
    forgetDevice,
    signOutOthers,
    createInvite,
    revokeInvites,
    checkInvite,
    joinWallet,
    createRistourneInvite,
    revokeRistourneInvites,
    checkRistourneInvite,
    joinRistourne,
    createDebtInvite,
    revokeDebtInvites,
    checkDebtInvite,
    joinDebt,
    declineDebt,
  };
}

export type Cloud = ReturnType<typeof useCloud>;

// Portefeuilles partagés (avec des membres) et dettes partagées, déjà dans la base (identifiants uuid)
function sharedKey(d: SyncData): string {
  const wallets = d.wallets.filter((w) => isUuid(w.id) && w.members?.some((m) => !m.removed)).map((w) => w.id).sort();
  const debts = (d.debtShares ?? []).filter((x) => isUuid(x.id)).map((x) => x.id).sort();
  return JSON.stringify([wallets, debts]);
}
