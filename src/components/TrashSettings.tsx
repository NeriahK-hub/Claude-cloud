import React from 'react';
import { Receipt, PieChart, Repeat, Trash2, Undo2 } from 'lucide-react';
import { daysLeft, TRASH_DAYS, trashClear, trashRemove, TrashItem, useTrash } from '../lib/trash';
import { askConfirm } from '../lib/confirm';
import { formatMoney } from '../lib/money';
import { haptic } from '../lib/haptics';

// Paramètres › Corbeille : ce qui a été supprimé ces 30 derniers jours, à rétablir d'un toucher.
const look = (x: TrashItem) =>
  x.kind === 'budget' ? { Icon: PieChart, color: '#F59E0B', what: 'Budget' } : x.kind === 'recurring' ? { Icon: Repeat, color: '#0EA5E9', what: 'Opération qui revient' } : { Icon: Receipt, color: '#64748B', what: x.txs.length > 1 ? 'Transfert' : 'Opération' };

const detail = (x: TrashItem) => {
  if (x.kind === 'transactions') {
    const sum = x.txs[0];
    return x.txs.length === 1 ? formatMoney(Math.abs(sum.amount), sum.currency) : `${x.txs.length} lignes`;
  }
  if (x.kind === 'budget') return formatMoney(x.budget.amount, x.budget.currency);
  return x.recurring.amount ? formatMoney(x.recurring.amount, x.recurring.currency) : '';
};

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "Aujourd'hui" : d === 1 ? 'Hier' : `Il y a ${d} jours`;
};

export const TrashSettings: React.FC<{ onRestore: (id: string) => void }> = ({ onRestore }) => {
  const items = useTrash();
  if (items.length === 0)
    return (
      <div className="bg-white rounded-3xl border border-slate-100 p-6 text-center">
        <span className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <Trash2 className="w-6 h-6 text-slate-400" />
        </span>
        <p className="text-[15px] font-semibold text-slate-900">La corbeille est vide</p>
        <p className="text-[13px] text-slate-500 mt-1 max-w-[280px] mx-auto">Ce que tu supprimes reste ici {TRASH_DAYS} jours : tu peux le rétablir si tu t’es trompé.</p>
      </div>
    );
  return (
    <>
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
        {items.map((x) => {
          const { Icon, color, what } = look(x);
          return (
            <div key={x.id} className="px-3.5 py-3">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${color}1f`, color }}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-slate-900 truncate">{x.label}</span>
                  <span className="block text-[12px] text-slate-500 truncate">
                    {what}
                    {detail(x) && ` · ${detail(x)}`} · {ago(x.at)}
                  </span>
                </span>
                <button
                  onClick={async () => {
                    const ok = await askConfirm({ title: 'Supprimer pour de bon ?', message: 'Tu ne pourras plus le rétablir.', confirmLabel: 'Supprimer', danger: true });
                    if (ok) trashRemove(x.id);
                  }}
                  aria-label="Supprimer définitivement"
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3 pl-[52px]">
                <span className="text-[12px] text-slate-400">
                  Encore {daysLeft(x)} jour{daysLeft(x) > 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => {
                    haptic();
                    onRestore(x.id);
                  }}
                  className="shrink-0 h-9 px-4 rounded-full bg-accent hover:bg-accent-hover text-[13px] font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Rétablir
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-slate-400 px-4 mt-1.5 leading-snug">Gardé {TRASH_DAYS} jours sur cet appareil, puis effacé tout seul.</p>
      <button
        onClick={async () => {
          const ok = await askConfirm({ title: 'Vider la corbeille ?', message: 'Tout sera supprimé pour de bon.', confirmLabel: 'Vider', danger: true });
          if (ok) trashClear();
        }}
        className="mt-3 mx-auto flex items-center gap-1.5 h-9 px-4 rounded-full bg-slate-100 text-[13px] font-semibold text-red-600 cursor-pointer active:scale-95 transition"
      >
        Vider la corbeille
      </button>
    </>
  );
};
