import React, { useEffect, useState } from 'react';
import { Search, Ban, CheckCircle2, Trash2, Shield } from 'lucide-react';
import { AdminUser, api, errorText } from '../api';
import { Button, Card, dateFr, ErrorLine, inputCls, Loading, nf } from '../ui';

// Comptes : liste, recherche, bloquer / débloquer, supprimer. On ne voit ni les montants ni les opérations.
export const UsersPage: React.FC<{ me: string }> = ({ me }) => {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);

  const load = async (q: string, append = false) => {
    setError('');
    try {
      const list = await api.users(q, append ? users?.length ?? 0 : 0);
      setUsers((prev) => (append ? [...(prev ?? []), ...list] : list));
      setMore(list.length === 50);
    } catch (e) {
      setError(errorText(e));
      setUsers((u) => u ?? []);
    }
  };

  // Recherche pendant la frappe (petit délai pour ne pas interroger à chaque lettre)
  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const act = async (u: AdminUser, fn: () => Promise<void>) => {
    setBusy(u.id);
    setError('');
    try {
      await fn();
      await load(search.trim());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un e-mail ou un nom" className={`${inputCls} pl-10`} />
      </div>
      <ErrorLine text={error} />
      {!users ? (
        <Loading />
      ) : users.length === 0 ? (
        <p className="text-[14px] text-slate-500 text-center py-8">Aucun compte trouvé.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {users.map((u) => (
            <li key={u.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[15px] font-semibold truncate">{u.name || u.email}</span>
                  {u.is_admin && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 text-[11px] font-semibold">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  )}
                  {u.banned && (
                    <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400 text-[11px] font-semibold">Bloqué</span>
                  )}
                </div>
                {u.name && <div className="text-[13px] text-slate-500 truncate">{u.email}</div>}
                <div className="text-[12px] text-slate-500 mt-0.5">
                  Inscrit le {dateFr(u.created_at)} · {nf(u.wallets)} portefeuille{u.wallets > 1 ? 's' : ''} · {nf(u.transactions)} opération{u.transactions > 1 ? 's' : ''}
                  {u.last_activity && ` · actif le ${dateFr(u.last_activity)}`}
                </div>
              </div>
              {u.id !== me && !u.is_admin && (
                <div className="flex gap-2">
                  {u.banned ? (
                    <Button busy={busy === u.id} onClick={() => act(u, () => api.setBanned(u.id, false))}>
                      <CheckCircle2 className="w-4 h-4" /> Débloquer
                    </Button>
                  ) : (
                    <Button busy={busy === u.id} onClick={() => act(u, () => api.setBanned(u.id, true))}>
                      <Ban className="w-4 h-4" /> Bloquer
                    </Button>
                  )}
                  <Button kind="danger" onClick={() => setToDelete(u)} aria-label={`Supprimer ${u.email}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {more && (
        <Button className="w-full mt-3" onClick={() => load(search.trim(), true)}>
          Afficher plus
        </Button>
      )}
      {toDelete && (
        <DeleteDialog
          user={toDelete}
          onClose={() => setToDelete(null)}
          onConfirm={async () => {
            const u = toDelete;
            setToDelete(null);
            await act(u, () => api.deleteUser(u.id));
          }}
        />
      )}
    </Card>
  );
};

// Suppression définitive : on retape l'adresse pour confirmer
const DeleteDialog: React.FC<{ user: AdminUser; onClose: () => void; onConfirm: () => void }> = ({ user, onClose, onConfirm }) => {
  const [typed, setTyped] = useState('');
  const ok = typed.trim().toLowerCase() === user.email.toLowerCase();
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-[#151a21] rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[20px] font-semibold">Supprimer ce compte ?</h3>
        <p className="text-[14px] text-slate-500 mt-2">
          Le compte <b className="text-slate-900 dark:text-white">{user.email}</b>, ses portefeuilles, opérations, catégories et ristournes seront
          supprimés définitivement. Ses opérations dans les portefeuilles partagés des autres restent, sans auteur.
        </p>
        <p className="text-[13px] text-slate-500 mt-4 mb-1.5">Tape l'adresse pour confirmer :</p>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputCls} placeholder={user.email} autoFocus />
        <div className="flex gap-2 mt-5">
          <Button className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button kind="danger" className="flex-1" disabled={!ok} onClick={onConfirm}>
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  );
};
