import React, { useState } from 'react';
import { Users, UserPlus, X, Info } from 'lucide-react';
import { Transaction, Wallet, WalletMember } from '../types';
import { formatMoney } from '../lib/money';

// Portefeuille partagé (ex. un couple qui économise ensemble).
// « Moi » n'est pas dans wallet.members : c'est la personne qui utilise l'app.
export const ME_ID = 'me';
const ME = { id: ME_ID, name: 'Moi', color: '#475569' }; // gris visible en clair comme en sombre
const MEMBER_COLORS = ['#EC4899', '#3B82F6', '#F97316', '#14B8A6', '#8B5CF6', '#EAB308', '#EF4444', '#059669'];

export const activeMembers = (w: Wallet | null | undefined): WalletMember[] => w?.members?.filter((m) => !m.removed) ?? [];
export const isShared = (w: Wallet | null | undefined) => activeMembers(w).length > 0;

// Qui a fait l'opération (moi si rien n'est indiqué ; « Ancien membre » s'il a été supprimé)
export function memberOf(w: Wallet | undefined, id: string | undefined): { id: string; name: string; color: string } {
  if (!id || id === ME_ID) return ME;
  return w?.members?.find((m) => m.id === id) ?? { id, name: 'Ancien membre', color: '#94A3B8' };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const MemberAvatar: React.FC<{ name: string; color: string; size?: 'xs' | 'sm' | 'md'; ring?: boolean }> = ({ name, color, size = 'sm', ring }) => {
  const box = { xs: 'w-5 h-5 text-[9px]', sm: 'w-7 h-7 text-[11px]', md: 'w-10 h-10 text-sm' }[size];
  return (
    <span
      title={name}
      className={`${box} shrink-0 rounded-full flex items-center justify-center font-bold text-white ${ring ? 'ring-2 ring-white' : ''}`}
      style={{ backgroundColor: color }}
    >
      {initials(name) || '?'}
    </span>
  );
};

// Pastilles superposées : moi + les membres
export const MemberStack: React.FC<{ wallet: Wallet; size?: 'xs' | 'sm' }> = ({ wallet, size = 'xs' }) => {
  const people = [ME, ...activeMembers(wallet)];
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {people.slice(0, 4).map((p) => (
        <MemberAvatar key={p.id} name={p.name} color={p.color} size={size} ring />
      ))}
      {people.length > 4 && <span className="pl-2.5 text-[11px] font-bold text-slate-500">+{people.length - 4}</span>}
    </span>
  );
};

// « Fait par » dans les formulaires (seulement si le portefeuille est partagé)
export const MemberChips: React.FC<{ wallet: Wallet | undefined; value: string; onChange: (id: string) => void; label?: string }> = ({
  wallet,
  value,
  onChange,
  label = 'Fait par',
}) => {
  if (!wallet || !isShared(wallet)) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-1">{label}</div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {[ME, ...activeMembers(wallet)].map((m) => {
          const on = (value || ME_ID) === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              aria-pressed={on}
              className={`shrink-0 flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-xs font-semibold cursor-pointer border ${
                on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              <MemberAvatar name={m.name} color={m.color} size="xs" />
              {m.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Bloc du détail du portefeuille : avec qui il est partagé + ce que chacun a mis / utilisé
export const SharingBlock: React.FC<{ wallet: Wallet; transactions: Transaction[]; onManage: () => void }> = ({ wallet: w, transactions, onManage }) => {
  const members = activeMembers(w);
  if (members.length === 0) {
    return (
      <button
        onClick={onManage}
        className="w-full bg-white rounded-3xl border border-dashed border-slate-300 p-4 mb-3 flex items-center gap-3 text-left cursor-pointer hover:bg-slate-50"
      >
        <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <UserPlus className="w-5 h-5 text-slate-700" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-slate-900">Partager ce portefeuille</span>
          <span className="block text-xs text-slate-500">Pour gérer cet argent à plusieurs, par ex. en couple</span>
        </span>
      </button>
    );
  }

  // Ce que chacun a mis (entrées) et utilisé (sorties), hors ajustements de solde
  const people = [ME, ...(w.members ?? [])];
  const stats = people
    .map((p) => {
      const mine = transactions.filter((t) => t.type !== 'adjustment' && (t.memberId || ME_ID) === p.id);
      return {
        ...p,
        removed: 'removed' in p && !!p.removed,
        put: mine.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
        used: mine.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0),
      };
    })
    .filter((p) => !p.removed || p.put > 0 || p.used > 0);
  const totalPut = stats.reduce((s, p) => s + p.put, 0);
  const money = (v: number) => formatMoney(v, w.currency);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-slate-500" />
        <span className="flex-1 text-sm font-bold text-slate-900">Partagé à {members.length + 1}</span>
        <button onClick={onManage} className="text-xs font-bold text-slate-700 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 cursor-pointer">
          Gérer
        </button>
      </div>

      {/* Part de chacun dans ce qui a été mis */}
      {totalPut > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mb-3 animate-bar">
          {stats.map((p) => (p.put > 0 ? <div key={p.id} style={{ width: `${(p.put / totalPut) * 100}%`, backgroundColor: p.color }} /> : null))}
        </div>
      )}
      <div className="space-y-2">
        {stats.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5">
            <MemberAvatar name={p.name} color={p.color} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {p.name}
                {p.removed && <span className="text-xs font-medium text-slate-400"> (retiré)</span>}
              </div>
              <div className="text-[11px] text-slate-500">{totalPut > 0 ? `${Math.round((p.put / totalPut) * 100)} % des versements` : 'Aucun versement'}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold tabular-nums text-emerald-600">+{money(p.put)}</div>
              <div className="text-xs font-semibold tabular-nums text-slate-500">−{money(p.used)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Fenêtre « Partager » : ajouter / retirer des personnes
export const MembersSheet: React.FC<{
  wallet: Wallet;
  onClose: () => void;
  onSave: (members: WalletMember[]) => void;
}> = ({ wallet, onClose, onSave }) => {
  const [members, setMembers] = useState<WalletMember[]>(wallet.members ?? []);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const visible = members.filter((m) => !m.removed);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
    setMembers((prev) => [...prev, { id: `m-${Date.now()}`, name: n, color, contact: contact.trim() || undefined }]);
    setName('');
    setContact('');
  };
  // On garde la personne en « retirée » pour que ses anciennes opérations restent à son nom
  const remove = (id: string) => setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, removed: true } : m)));

  const field = 'w-full px-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-[#D8FB52]';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold">Partager « {wallet.name} »</h2>
          <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Chaque opération indique qui l'a faite, et tu vois ce que chacun a mis et utilisé.</p>

        <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 mb-4">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <MemberAvatar name={ME.name} color={ME.color} />
            <span className="flex-1 text-sm font-semibold">Moi</span>
            <span className="text-[11px] font-semibold text-slate-400">Propriétaire</span>
          </div>
          {visible.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 px-3 py-2.5">
              <MemberAvatar name={m.name} color={m.color} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{m.name}</span>
                {m.contact && <span className="block text-[11px] text-slate-400 truncate">{m.contact}</span>}
              </span>
              <button onClick={() => remove(m.id)} aria-label={`Retirer ${m.name}`} className="w-8 h-8 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="text-xs font-bold text-slate-500 mb-1.5">Ajouter une personne</div>
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Nom (ex. Marie)" className={field} />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Téléphone ou e-mail (facultatif)" className={field} />
          <button
            onClick={add}
            disabled={!name.trim()}
            className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
          >
            <UserPlus className="w-4 h-4" /> Ajouter
          </button>
        </div>

        <p className="flex gap-1.5 text-[11px] text-slate-500 mt-4">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Pour l'instant, le partage se fait sur cet appareil : on note qui a fait chaque opération. La synchronisation entre plusieurs téléphones demandera un compte en ligne.</span>
        </p>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-slate-100 text-sm font-bold cursor-pointer">
            Annuler
          </button>
          <button
            onClick={() => {
              // Un nom tapé mais pas encore ajouté compte aussi
              const n = name.trim();
              const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
              onSave(n ? [...members, { id: `m-${Date.now()}`, name: n, color, contact: contact.trim() || undefined }] : members);
            }}
            className="flex-[2] py-3 rounded-2xl bg-[#D8FB52] text-slate-900 text-sm font-bold cursor-pointer"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};
