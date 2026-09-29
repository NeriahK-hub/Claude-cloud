import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronDown, Plus, X, HandCoins, Undo2 } from 'lucide-react';
import { Settings, Transaction } from '../types';
import { formatMoney } from '../lib/money';
import { DEBT_CATEGORY, debtsSummary, DebtEntry, DebtSide, NO_NAME } from '../lib/debts';
import { MemberAvatar } from './Members';
import { TransactionItem } from './TransactionItem';
import { haptic } from '../lib/haptics';

export interface DebtPreset {
  categoryId: string;
  withPerson?: string;
  amount?: number;
  currency?: string;
}

interface DebtsViewProps {
  transactions: Transaction[];
  settings: Settings;
  onBack: () => void;
  onAdd: (preset?: DebtPreset) => void;
  onSelectTransaction: (tx: Transaction) => void;
}

const COLORS = ['#F97316', '#3B82F6', '#EC4899', '#14B8A6', '#8B5CF6', '#EAB308', '#EF4444', '#0EA5E9'];
const colorOf = (name: string) => COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

// Dettes et prêts : qui me doit quoi, à qui je dois quoi
export const DebtsView: React.FC<DebtsViewProps> = ({ transactions, settings, onBack, onAdd, onSelectTransaction }) => {
  const [side, setSide] = useState<DebtSide>('receivable');
  const [showSettled, setShowSettled] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const main = settings.mainCurrency;
  const money = (v: number) => formatMoney(v, main);

  const entries = useMemo(() => debtsSummary(transactions, settings), [transactions, settings]);
  const open = entries.filter((e) => e.side === side && e.left > 0.004);
  const settled = entries.filter((e) => e.side === side && e.left <= 0.004);
  const totals = {
    receivable: entries.filter((e) => e.side === 'receivable' && e.left > 0).reduce((s, e) => s + e.left, 0),
    payable: entries.filter((e) => e.side === 'payable' && e.left > 0).reduce((s, e) => s + e.left, 0),
  };
  const counts = {
    receivable: entries.filter((e) => e.side === 'receivable' && e.left > 0.004).length,
    payable: entries.filter((e) => e.side === 'payable' && e.left > 0.004).length,
  };
  const viewing = entries.find((e) => e.key === openKey);

  const tile = (s: DebtSide, label: string) => (
    <button
      onClick={() => {
        haptic();
        setSide(s);
      }}
      aria-pressed={side === s}
      className={`text-left p-3.5 rounded-3xl border-2 cursor-pointer transition ${side === s ? 'bg-white sel-ring border-transparent' : 'border-transparent bg-white/60 hover:bg-white'}`}
    >
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${s === 'receivable' ? 'text-emerald-600' : 'text-rose-600'}`}>{money(totals[s])}</div>
      <div className="text-[11px] text-slate-500">
        {counts[s]} personne{counts[s] > 1 ? 's' : ''}
      </div>
    </button>
  );

  const row = (e: DebtEntry) => {
    const ratio = e.total > 0 ? Math.min(1, e.paid / e.total) : 1;
    return (
      <button
        key={e.key}
        onClick={() => setOpenKey(e.key)}
        className="w-full text-left bg-white rounded-3xl border border-slate-100 p-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50"
      >
        <MemberAvatar name={e.name === NO_NAME ? '?' : e.name} color={e.name === NO_NAME ? '#94A3B8' : colorOf(e.name)} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900 truncate">{e.name}</span>
            <span className="text-sm font-bold tabular-nums text-slate-900 shrink-0">{e.left > 0.004 ? money(e.left) : 'Réglé'}</span>
          </div>
          <div className="h-1.5 mt-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 animate-bar" style={{ width: `${ratio * 100}%` }} />
          </div>
          <div className="text-[11px] tabular-nums text-slate-500 mt-1 truncate">
            {e.side === 'receivable' ? 'Prêté' : 'Emprunté'} {money(e.total)} · remboursé {money(e.paid)} · {day(e.last)}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="px-5 pt-4 pb-8 animate-screen">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Dettes et prêts</h1>
        <button
          onClick={() => onAdd()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#D8FB52] text-slate-900 text-xs font-bold cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Nouveau
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {tile('receivable', 'On me doit')}
        {tile('payable', 'Je dois')}
      </div>

      {open.length === 0 && settled.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 text-center">
          <span className="w-14 h-14 mx-auto rounded-full bg-[#D8FB52]/40 flex items-center justify-center mb-3">
            <HandCoins className="w-7 h-7 text-slate-900" />
          </span>
          <h2 className="text-base font-bold text-slate-900">{side === 'receivable' ? "Personne ne te doit d'argent" : 'Tu ne dois rien à personne'}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Note un {side === 'receivable' ? 'prêt' : 'emprunt'} avec le nom de la personne : Wallo suit les remboursements et ce qu'il reste.
          </p>
          <button
            onClick={() => onAdd({ categoryId: DEBT_CATEGORY[side].more })}
            className="w-full py-3 rounded-2xl bg-[#D8FB52] text-slate-900 text-sm font-bold cursor-pointer"
          >
            {side === 'receivable' ? "J'ai prêté de l'argent" : "J'ai emprunté de l'argent"}
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {open.map(row)}
            {open.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Tout est réglé de ce côté.</p>}
          </div>
          {settled.length > 0 && (
            <>
              <button
                onClick={() => setShowSettled((s) => !s)}
                className="w-full mt-5 mb-2 flex items-center justify-between text-sm font-bold text-slate-500 cursor-pointer"
              >
                Réglés ({settled.length})
                <ChevronDown className={`w-4 h-4 transition-transform ${showSettled ? 'rotate-180' : ''}`} />
              </button>
              {showSettled && <div className="space-y-2 animate-fade-in">{settled.map(row)}</div>}
            </>
          )}
        </>
      )}

      {viewing && (
        <DebtDetail
          entry={viewing}
          money={money}
          onClose={() => setOpenKey(null)}
          onRepay={() => {
            setOpenKey(null);
            onAdd({
              categoryId: DEBT_CATEGORY[viewing.side].repay,
              withPerson: viewing.name === NO_NAME ? undefined : viewing.name,
              amount: viewing.left > 0 ? viewing.left : undefined,
              currency: main,
            });
          }}
          onMore={() => {
            setOpenKey(null);
            onAdd({ categoryId: DEBT_CATEGORY[viewing.side].more, withPerson: viewing.name === NO_NAME ? undefined : viewing.name });
          }}
          onSelectTransaction={onSelectTransaction}
        />
      )}
    </div>
  );
};

const DebtDetail: React.FC<{
  entry: DebtEntry;
  money: (v: number) => string;
  onClose: () => void;
  onRepay: () => void;
  onMore: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}> = ({ entry: e, money, onClose, onRepay, onMore, onSelectTransaction }) => {
  const r = e.side === 'receivable';
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <MemberAvatar name={e.name === NO_NAME ? '?' : e.name} color={e.name === NO_NAME ? '#94A3B8' : colorOf(e.name)} size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold truncate">{e.name}</div>
            <div className="text-xs text-slate-500">{r ? 'Te doit' : 'Tu lui dois'}</div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2 text-center">
          {[
            [r ? 'Prêté' : 'Emprunté', e.total],
            ['Remboursé', e.paid],
            ['Reste', Math.max(0, e.left)],
          ].map(([label, v]) => (
            <div key={label as string} className="p-2.5 rounded-2xl bg-slate-100">
              <div className="text-[11px] font-semibold text-slate-500">{label}</div>
              <div className="text-xs font-bold tabular-nums text-slate-900">{money(v as number)}</div>
            </div>
          ))}
        </div>
        {e.left < -0.004 && (
          <p className="text-xs text-slate-500 mb-2">
            Remboursé {money(-e.left)} de plus que noté : le {r ? 'prêt' : 'emprunt'} d'origine est sans doute avant le début de ton historique.
          </p>
        )}
        {e.name === NO_NAME && (
          <p className="text-xs text-amber-700 mb-2">Ces opérations n'ont pas de nom. Ouvre-en une et indique « Avec qui » pour la ranger.</p>
        )}

        <div className="flex gap-2 my-3">
          {e.left > 0.004 && (
            <button onClick={onRepay} className="flex-[2] py-3 rounded-2xl bg-[#D8FB52] text-slate-900 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">
              <Undo2 className="w-4 h-4" /> {r ? 'Il/elle me rembourse' : 'Je rembourse'}
            </button>
          )}
          <button onClick={onMore} className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
            <Plus className="w-4 h-4" /> {r ? 'Prêter' : 'Emprunter'}
          </button>
        </div>

        <div className="text-xs font-bold text-slate-500 mb-1">Historique</div>
        {[...e.txs]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((t) => (
            <TransactionItem key={t.id} transaction={t} onClick={onSelectTransaction} />
          ))}
      </div>
    </div>
  );
};
