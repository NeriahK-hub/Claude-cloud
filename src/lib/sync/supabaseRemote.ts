// La base Supabase vue par le moteur de synchro (voir engine.ts > Remote)
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Remote, SyncCheck } from './engine';
import type { Row, TableName } from './mapping';

// Clé d'unicité de chaque table (catégories et icônes : identifiant de l'app, propre à chaque personne)
const CONFLICT: Partial<Record<TableName, string>> = { categories: 'user_id,id', custom_icons: 'user_id,id' };
const PAGE = 1000; // Supabase renvoie au plus 1000 lignes par requête

export function supabaseRemote(sb: SupabaseClient, me: string): Remote {
  const must = <T>({ data, error }: { data: T; error: { message: string } | null }): T => {
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    me,
    acceptInvites: async () => Number(must(await sb.rpc('accept_invites')) ?? 0),
    pull: async (table, since) => {
      const out: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = sb.from(table).select('*').order('updated_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
        if (since) q = q.gt('updated_at', since);
        const rows = must(await q) as Row[];
        out.push(...rows);
        if (rows.length < PAGE) return out;
      }
    },
    upsert: async (table, rows) => {
      must(await sb.from(table).upsert(rows, { onConflict: CONFLICT[table] ?? 'id' }));
    },
    softDelete: async (table, ids) => {
      must(await sb.from(table).update({ deleted_at: new Date().toISOString() }).in('id', ids));
    },
    leaveWallet: async (id) => {
      must(await sb.rpc('leave_wallet', { w: id }));
    },
    visibleWalletIds: async () => (must(await sb.from('wallets').select('id').is('deleted_at', null)) as { id: string }[]).map((r) => r.id),
    leaveRistourne: async (id) => {
      must(await sb.rpc('leave_ristourne', { r: id }));
    },
    visibleRistourneIds: async () => (must(await sb.from('ristournes').select('id').is('deleted_at', null)) as { id: string }[]).map((r) => r.id),
    leaveDebtShare: async (id) => {
      must(await sb.rpc('leave_debt_share', { s: id }));
    },
    // Un seul appel « y a-t-il du nouveau ? » (sync_check). Base pas encore à jour : null -> synchro complète
    check: async (since) => {
      const { data, error } = await sb.rpc('sync_check', { p_since: since });
      if (error || !data) return null;
      return parseCheck(data);
    },
    visibleDebtShareIds: async () => (must(await sb.from('debt_shares').select('id').is('deleted_at', null)) as { id: string }[]).map((r) => r.id),
  };
}

export function parseCheck(data: unknown): SyncCheck | null {
  const d = data as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(String) : null);
  const changed = ids(d.changed);
  const wallets = ids(d.wallets);
  const ristournes = ids(d.ristournes);
  const debtShares = ids(d.debt_shares);
  if (!changed || !wallets || !ristournes || !debtShares) return null;
  return { invites: Number(d.invites) || 0, changed: changed as SyncCheck['changed'], wallets, ristournes, debtShares };
}
