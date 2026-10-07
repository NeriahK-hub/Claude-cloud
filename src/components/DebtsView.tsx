import React, { useMemo, useState, useLayoutEffect } from 'react';
import { takeJump } from '../lib/jumpTo';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, X, HandCoins, Pencil, Trash2, Link2, CalendarClock } from 'lucide-react';
import { DebtMove, DebtShare, Settings, Transaction, Wallet } from '../types';
import type { Cloud } from '../lib/sync/useCloud';
import { DebtActions, DebtSummary, InterestSheet, SharedDebtDetail } from './SharedDebt';
import { convertBetween, formatMoney, toMain } from '../lib/money';
import { DEBT_CATEGORY, debtKey, debtsSummary, DebtEntry, DebtSide, dueLevel, NO_NAME, samePerson } from '../lib/debts';
import { DateField, formatDay, localDay } from './DatePicker';
import { MemberAvatar } from './Members';
import { TransactionItem } from './TransactionItem';
import { haptic } from '../lib/haptics';
import { LoginSheet } from './Account';
import { useIsDesktop } from '../hooks/useIsDesktop';

export interface DebtPreset {
  categoryId: string;
  withPerson?: string;
  amount?: number;
  currency?: string;
}

// Dettes partagées avec d'autres comptes Wallo (voir App.tsx)
export interface SharedDebts {
  shares: DebtShare[];
  me: string; // compte connecté ('' = pas connecté)
  wallets: Wallet[]; // portefeuilles actifs, pour noter un mouvement
  cloud: Cloud;
  onShare: (e: DebtEntry) => string | null;
  onAddMove: (shareId: string, m: { kind: DebtMove['kind']; amount: number; currency: string; note?: string; walletId: string | null }) => void;
  onConfirm: (shareId: string, moveId: string, walletId: string | null) => void;
  onRemove: (shareId: string, moveId: string, message: string) => void;
  onRequestDelete: (shareId: string, moveId: string) => void;
  onAnswerDelete: (shareId: string, moveId: string, accept: boolean) => void;
  onLinkWallet: (shareId: string, moveId: string, walletId: string) => void;
  onLeave: (shareId: string) => void;
  onRename: (shareId: string, name: string) => void;
  onEditMove: (shareId: string, moveId: string, changes: { amount: number; note?: string }) => void;
  onJoin: () => void; // code reçu à taper
}

interface DebtsViewProps {
  transactions: Transaction[];
  settings: Settings;
  onBack: () => void;
  onAdd: (preset?: DebtPreset) => void;
  onSelectTransaction: (tx: Transaction) => void;
  onEdit: (updates: { id: string; changes: Partial<Transaction> }[], message: string) => void;
  onDelete: (ids: string[], message: string) => void; // supprimer une dette / un prêt (erreur de saisie)
  shared?: SharedDebts;
  onAddInterest?: (entry: DebtEntry, amount: number, currency: string) => void;
  onRemoveInterest?: (txId: string) => void; // retirer les intérêts notés sur un prêt
}

const COLORS = ['#F97316', '#3B82F6', '#EC4899', '#14B8A6', '#8B5CF6', '#EAB308', '#EF4444', '#0EA5E9'];
const colorOf = (name: string) => COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
// « 29 sept. » cette année, « 19 mai 2025 » avant
const shortDay = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
};

// Dettes et prêts : qui me doit quoi, à qui je dois quoi
export const DebtsView: React.FC<DebtsViewProps> = ({ transactions, settings, onBack, onAdd, onSelectTransaction, onEdit, onDelete, shared, onAddInterest, onRemoveInterest }) => {
  const desktop = useIsDesktop(); // ordinateur : pas de retour ni de titre en double, contenu sur plusieurs colonnes
  const [side, setSide] = useState<DebtSide>('receivable');
  const [showSettled, setShowSettled] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Conseil « À rendre bientôt » / « … te doit encore » : on ouvre la fiche de cette personne
  useLayoutEffect(() => {
    const j = takeJump('debt');
    if (!j) return;
    const e = debtsSummary(transactions, settings, shared?.shares, shared?.me).find((x) => x.key === j.key);
    if (e) {
      setSide(e.side);
      setOpenKey(e.key);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const main = settings.mainCurrency;
  const money = (v: number) => formatMoney(v, main);

  const entries = useMemo(() => debtsSummary(transactions, settings, shared?.shares, shared?.me), [transactions, settings, shared?.shares, shared?.me]);
  // Réglé = plus rien à payer et rien qui attend ma réponse
  const isOpen = (e: DebtEntry) => e.left > 0.004 || (e.waiting ?? 0) > 0;
  const open = entries.filter((e) => e.side === side && isOpen(e));
  const settled = entries.filter((e) => e.side === side && !isOpen(e));
  // Montants d'une ligne : dans la devise de la dette (partagée, ou choisie à la saisie), sinon la principale
  const moneyOf = (e: DebtEntry) => (v: number) => formatMoney(v, e.currency ?? main);
  const leftMain = (e: DebtEntry) => (e.currency ? toMain(e.left, e.currency, settings) : e.left);
  const totals = {
    receivable: entries.filter((e) => e.side === 'receivable' && e.left > 0).reduce((s, e) => s + leftMain(e), 0),
    payable: entries.filter((e) => e.side === 'payable' && e.left > 0).reduce((s, e) => s + leftMain(e), 0),
  };
  const counts = {
    receivable: entries.filter((e) => e.side === 'receivable' && e.left > 0.004).length,
    payable: entries.filter((e) => e.side === 'payable' && e.left > 0.004).length,
  };
  const viewing = entries.find((e) => e.key === openKey);

  const tile = (s: DebtSide, label: string) => {
    const amount = money(totals[s]);
    return (
    <button
      onClick={() => {
        haptic();
        setSide(s);
      }}
      aria-pressed={side === s}
      className={`@container min-w-0 text-left p-3.5 rounded-3xl border-2 cursor-pointer transition ${side === s ? 'bg-white sel-ring border-transparent' : 'border-transparent bg-white/60 hover:bg-white'}`}
    >
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      {/* La taille suit la largeur de la tuile et la longueur du montant : jamais de débordement à 375 px */}
      <div
        className={`font-extrabold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis leading-snug ${s === 'receivable' ? 'text-emerald-600' : 'text-rose-600'}`}
        style={{ fontSize: `min(18px, ${(160 / Math.max(amount.length, 1)).toFixed(2)}cqi)` }}
      >
        {amount}
      </div>
      <div className="text-[12px] text-slate-500">
        {counts[s]} personne{counts[s] > 1 ? 's' : ''}
      </div>
    </button>
    );
  };

  const row = (e: DebtEntry) => {
    const due = e.total + e.interest;
    const ratio = due > 0 ? Math.min(1, e.paid / due) : 1;
    const m = moneyOf(e);
    return (
      <button
        key={e.key}
        onClick={() => setOpenKey(e.key)}
        className="w-full text-left bg-white rounded-3xl border border-slate-100 p-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50"
      >
        <MemberAvatar name={e.name === NO_NAME ? '?' : e.name} color={e.name === NO_NAME ? '#94A3B8' : colorOf(e.name)} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 min-w-0">
              <span className="truncate">{e.name}</span>
              {e.share && <Link2 className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-label="Dette partagée" />}
            </span>
            {e.left < -0.004 ? (
              <span className="text-xs font-bold text-amber-700 shrink-0">Trop remboursé</span>
            ) : (
              <span className="text-sm font-bold tabular-nums text-slate-900 shrink-0">{e.left > 0.004 ? m(e.left) : 'Réglé'}</span>
            )}
          </div>
          <div className="h-1.5 mt-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 animate-bar" style={{ width: `${ratio * 100}%` }} />
          </div>
          {/* Une seule petite ligne : le détail est dans la fiche */}
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-slate-500">
            {(e.waiting ?? 0) > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 text-[11px] font-bold">{e.waiting} à confirmer</span>
            ) : (
              <span className="tabular-nums">{Math.round(ratio * 100)} % remboursé</span>
            )}
            {e.due && e.left > 0.004 ? <DueChip entry={e} /> : e.last && <span className="shrink-0">{shortDay(e.last)}</span>}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className={desktop ? 'max-w-5xl animate-screen' : 'px-5 pt-4 pb-8 animate-screen'}>
      <div className={`${desktop ? 'desk-head' : 'page-head'} flex items-center gap-3 mb-4`}>
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Dettes et prêts</h1>
        <button
          onClick={() => onAdd()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-accent text-slate-900 text-xs font-bold cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Nouveau
        </button>
      </div>

      <div className={`grid grid-cols-2 gap-2 mb-3 ${desktop ? 'max-w-2xl' : ''}`}>
        {tile('receivable', 'On me doit')}
        {tile('payable', 'Je dois')}
      </div>

      {/* Code reçu pour suivre une dette partagée : bien visible, pas au bout de la liste */}
      {shared?.cloud.configured && (
        <button
          onClick={shared.onJoin}
          className="w-full mb-4 px-4 py-3 rounded-2xl border border-dashed border-slate-300 flex items-center gap-3 text-left cursor-pointer hover:bg-white"
        >
          <Link2 className="w-4 h-4 shrink-0 text-slate-600" />
          <span className="flex-1 min-w-0 text-sm text-slate-600">
            On t'a partagé une dette&nbsp;? <b className="text-slate-900 whitespace-nowrap">Entrer le code</b>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
        </button>
      )}

      {open.length === 0 && settled.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 text-center">
          <span className="w-14 h-14 mx-auto rounded-full bg-accent/40 flex items-center justify-center mb-3">
            <HandCoins className="w-7 h-7 text-slate-900" />
          </span>
          <h2 className="text-base font-bold text-slate-900">{side === 'receivable' ? "Personne ne te doit d'argent" : 'Tu ne dois rien à personne'}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Note un {side === 'receivable' ? 'prêt' : 'emprunt'} avec le nom de la personne : Wallo suit les remboursements et ce qu'il reste.
          </p>
          <button
            onClick={() => onAdd({ categoryId: DEBT_CATEGORY[side].more })}
            className="w-full py-3 rounded-2xl bg-accent text-slate-900 text-sm font-bold cursor-pointer"
          >
            {side === 'receivable' ? "J'ai prêté de l'argent" : "J'ai emprunté de l'argent"}
          </button>
        </div>
      ) : (
        <>
          <div className={desktop ? 'grid grid-cols-2 gap-3' : 'space-y-2'}>
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
              {showSettled && <div className={`${desktop ? 'grid grid-cols-2 gap-3' : 'space-y-2'} animate-fade-in`}>{settled.map(row)}</div>}
            </>
          )}
        </>
      )}

      {viewing?.share && shared && (
        <SharedDebtDetail entry={viewing} share={viewing.share} shared={shared} money={money} settings={settings} onClose={() => setOpenKey(null)} />
      )}

      {viewing && !viewing.share && (
        <DebtDetail
          onShare={
            shared?.cloud.configured && viewing.name !== NO_NAME
              ? () => {
                  shared.onShare(viewing);
                }
              : undefined
          }
          cloud={shared?.cloud}
          onAddInterest={onAddInterest && ((amount, currency) => onAddInterest(viewing, amount, currency))}
          onRemoveInterest={onRemoveInterest}
          // Échéance : posée sur les prêts / emprunts du tour en cours (la plus proche compte)
          onSetDue={(day) =>
            onEdit(
              viewing.txs.filter((t) => t.categoryId === DEBT_CATEGORY[viewing.side].more).map((t) => ({ id: t.id, changes: { dueDate: day } })),
              day ? `À rembourser le ${formatDay(day).toLowerCase()}` : 'Date de remboursement retirée'
            )
          }
          entry={viewing}
          money={moneyOf(viewing)}
          settings={settings}
          // Autres personnes (pour regrouper deux noms), et toutes les opérations de celle-ci, des deux côtés
          people={[...new Set(entries.map((x) => x.name))].filter((n) => n !== NO_NAME && !samePerson(n, viewing.name))}
          personTxs={viewing.name === NO_NAME ? viewing.txs : entries.filter((x) => samePerson(x.name, viewing.name)).flatMap((x) => [...x.txs, ...(x.pastTxs ?? [])])}
          onSave={(name, amounts) => {
            const renamed = name !== viewing.name;
            const updates: { id: string; changes: Partial<Transaction> }[] = [];
            // Renommer : toutes ses opérations, tours déjà réglés compris
            const all = viewing.name === NO_NAME ? viewing.txs : entries.filter((x) => samePerson(x.name, viewing.name)).flatMap((x) => [...x.txs, ...(x.pastTxs ?? [])]);
            for (const t of all) {
              const changes: Partial<Transaction> = {};
              if (renamed) {
                changes.withPerson = name;
                // Note écrite par l'app (« Prêt accordé · Kemy ») : on y met le nouveau nom
                if (viewing.name !== NO_NAME && t.title === `${t.category} · ${t.withPerson ?? viewing.name}`) changes.title = `${t.category} · ${name}`;
              }
              const a = amounts[t.id];
              if (a !== undefined && a !== Math.abs(t.amount)) {
                changes.amount = Math.sign(t.amount) * a;
                changes.originalAmount = undefined; // le montant saisi est dans la devise du portefeuille
                changes.originalCurrency = undefined;
              }
              if (Object.keys(changes).length) updates.push({ id: t.id, changes });
            }
            if (!updates.length) return;
            const merged = renamed && entries.some((x) => x !== viewing && samePerson(x.name, name) && x.side === viewing.side);
            onEdit(updates, merged ? `Regroupé avec ${name}` : renamed ? `Renommé en ${name}` : 'Montants corrigés');
            setOpenKey(debtKey(viewing.side, name));
          }}
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
          onDelete={() => {
            const r = viewing.side === 'receivable';
            onDelete(
              viewing.txs.map((t) => t.id),
              viewing.name === NO_NAME ? (r ? 'Prêts supprimés' : 'Dettes supprimées') : r ? `Prêt à ${viewing.name} supprimé` : `Dette envers ${viewing.name} supprimée`
            );
            setOpenKey(null);
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
  settings: Settings;
  people: string[];
  personTxs: Transaction[];
  onSave: (name: string, amounts: Record<string, number>) => void;
  onClose: () => void;
  onRepay: () => void;
  onMore: () => void;
  onDelete: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onShare?: () => void; // partager avec la personne (compte en ligne)
  cloud?: Cloud;
  onAddInterest?: (amount: number, currency: string) => void;
  onRemoveInterest?: (txId: string) => void;
  onSetDue: (day: string) => void; // '' = retirer
}> = ({ entry: e, money, settings, people, personTxs, onSave, onClose, onRepay, onMore, onDelete, onSelectTransaction, onShare, cloud, onAddInterest, onRemoveInterest, onSetDue }) => {
  const r = e.side === 'receivable';
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [login, setLogin] = useState(false);
  const [addingInterest, setAddingInterest] = useState(false);
  const [showPast, setShowPast] = useState(false); // tours déjà réglés
  if (editing) {
    return (
      <DebtEditor
        entry={e}
        money={money}
        settings={settings}
        people={people}
        personTxs={personTxs}
        onCancel={() => setEditing(false)}
        onSave={(name, amounts) => {
          onSave(name, amounts);
          setEditing(false);
        }}
      />
    );
  }
  return (
    <>
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="sheet-head flex items-center gap-3 mb-3">
          <MemberAvatar name={e.name === NO_NAME ? '?' : e.name} color={e.name === NO_NAME ? '#94A3B8' : colorOf(e.name)} size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold truncate">{e.name}</div>
            <div className="text-xs text-slate-500">{r ? 'Te doit' : 'Tu lui dois'}</div>
          </div>
          <button onClick={() => setEditing(true)} className="h-9 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            <Pencil className="w-3.5 h-3.5" /> Modifier
          </button>
          <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <DebtSummary side={e.side} total={e.total} interest={e.interest} paid={e.paid} left={e.left} money={money} settings={settings} currency={e.currency} />
        {e.name === NO_NAME && (
          <p className="text-xs text-amber-700 mb-2">Ces opérations n'ont pas de nom. Ouvre-en une et indique « Avec qui » pour la ranger.</p>
        )}

        {e.left > 0.004 && (
          <div className="mb-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-bold text-slate-500">{r ? 'À me rembourser le' : 'À rembourser le'}</span>
              {e.due && <DueChip entry={e} />}
            </div>
            <DateField value={e.due ?? ''} onChange={onSetDue} placeholder="Pas de date (facultatif)" shortcuts="future" min={localDay(new Date())} label="Date de remboursement" />
          </div>
        )}

        <DebtActions
          side={e.side}
          showRepay={e.left > 0.004}
          onRepay={onRepay}
          onMore={onMore}
          onInterest={onAddInterest && e.total > 0 ? () => setAddingInterest(true) : undefined}
          // Partager : la personne voit la dette chez elle, chaque remboursement est confirmé par vous deux
          onShare={onShare ? () => (cloud?.user ? onShare() : setLogin(true)) : undefined}
        />

        <div className="text-xs font-bold text-slate-500 mb-1">Historique</div>
        {[...e.txs]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((t) => (
            <TransactionItem key={t.id} transaction={t} onClick={onSelectTransaction} />
          ))}
        {/* Tours déjà réglés : repliés (un nouveau prêt repart de zéro) */}
        {(e.pastTxs?.length ?? 0) > 0 && (
          <>
            <button
              onClick={() => setShowPast((v) => !v)}
              className="w-full mt-3 py-2 flex items-center justify-between text-xs font-bold text-slate-500 cursor-pointer"
            >
              Déjà réglé ({e.pastTxs!.length})
              <ChevronDown className={`w-4 h-4 transition-transform ${showPast ? 'rotate-180' : ''}`} />
            </button>
            {showPast && (
              <div className="opacity-70 animate-fade-in">
                {[...e.pastTxs!]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((t) => (
                    <TransactionItem key={t.id} transaction={t} onClick={onSelectTransaction} />
                  ))}
              </div>
            )}
          </>
        )}

        {/* Erreur de saisie : on supprime toute la dette (ou tout le prêt), avec confirmation */}
        {confirmDelete ? (
          <div className="mt-4 p-4 rounded-2xl bg-red-50 border border-red-500/20 animate-fade-in">
            <p className="text-sm font-bold text-red-600">
              Supprimer {r ? `le prêt à ${e.name}` : `la dette envers ${e.name}`} ?
            </p>
            <p className="text-xs text-red-600/85 mt-1">
              {e.txs.length} opération{e.txs.length > 1 ? 's' : ''} ({r ? 'prêts et remboursements' : 'emprunts et remboursements'}) {e.txs.length > 1 ? 'seront supprimées' : 'sera supprimée'}.
              Les soldes des portefeuilles reviennent comme avant. Impossible d'annuler.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold text-slate-700 cursor-pointer">
                Annuler
              </button>
              <button
                onClick={() => {
                  haptic('warning');
                  onDelete();
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer"
              >
                Supprimer
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full mt-4 py-3 rounded-2xl text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" /> Supprimer {r ? 'ce prêt' : 'cette dette'}
          </button>
        )}
      </div>
    </div>
    {/* En dehors de la fenêtre animée : sinon elle y serait enfermée */}
    {login && cloud && !cloud.user && <LoginSheet cloud={cloud} onClose={() => setLogin(false)} />}
    {addingInterest && onAddInterest && (
      <InterestSheet
        side={e.side}
        person={e.name}
        base={e.total}
        currency={e.currency ?? settings.mainCurrency}
        currencies={[...new Set([e.currency ?? settings.mainCurrency, settings.mainCurrency, ...(settings.secondCurrency ? [settings.secondCurrency] : []), ...e.txs.map((t) => t.currency)])]}
        existing={e.txs
          .filter((t) => (t.interest ?? 0) > 0)
          .map((t) => ({ id: t.id, amount: formatMoney(t.interest!, t.currency), label: `sur ${t.title} · ${day(t.createdAt)}`, action: 'Retirer' }))}
        onRemove={onRemoveInterest}
        onClose={() => setAddingInterest(false)}
        onSave={(amount, currency) => {
          onAddInterest(amount, currency);
          setAddingInterest(false);
        }}
      />
    )}
    </>
  );
};

// Modifier une personne : son nom (ou la regrouper avec une autre) et les montants notés
const DebtEditor: React.FC<{
  entry: DebtEntry;
  money: (v: number) => string;
  settings: Settings;
  people: string[];
  personTxs: Transaction[];
  onCancel: () => void;
  onSave: (name: string, amounts: Record<string, number>) => void;
}> = ({ entry: e, money, settings, people, personTxs, onCancel, onSave }) => {
  const r = e.side === 'receivable';
  const [name, setName] = useState(e.name === NO_NAME ? '' : e.name);
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(e.txs.map((t) => [t.id, String(Math.abs(t.amount)).replace('.', ',')]))
  );
  const parse = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
  const amounts = Object.fromEntries(Object.entries(texts).map(([id, v]) => [id, parse(v)]));
  const invalid = Object.values(amounts).some((v) => !(v > 0));
  const grows = (t: Transaction) => t.categoryId === DEBT_CATEGORY[e.side].more;
  // Reste recalculé avec les montants saisis
  const inDebt = (v: number, c: string) => (e.currency ? convertBetween(v, c, e.currency, settings) ?? toMain(v, c, settings) : toMain(v, c, settings));
  const sum = (list: Transaction[]) => list.reduce((s, t) => s + (amounts[t.id] > 0 ? Math.abs(inDebt(amounts[t.id], t.currency)) : 0), 0);
  const left = sum(e.txs.filter(grows)) + e.interest - sum(e.txs.filter((t) => !grows(t)));
  // Les noms qui se ressemblent d'abord (même début), puis les autres
  const start = (e.name === NO_NAME ? name : e.name).trim().toLowerCase().slice(0, 2);
  const suggestions = [...people]
    .filter((p) => !samePerson(p, name))
    .sort((a, b) => Number(!!start && b.toLowerCase().startsWith(start)) - Number(!!start && a.toLowerCase().startsWith(start)) || a.localeCompare(b, 'fr'))
    .slice(0, 8);
  const others = personTxs.length - e.txs.length; // ses opérations de l'autre côté (renommées aussi)

  const field = 'w-full px-4 py-3 rounded-2xl bg-slate-100 text-base outline-none focus:ring-2 focus:ring-accent';
  const section = (title: string, list: Transaction[]) =>
    list.length > 0 && (
      <>
        <div className="text-xs font-bold text-slate-500 mt-4 mb-1.5">{title}</div>
        <div className="space-y-1.5">
          {[...list]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{t.title}</div>
                  <div className="text-[12px] text-slate-500">{day(t.createdAt)}</div>
                </div>
                <div className="relative w-36 shrink-0">
                  <input
                    value={texts[t.id]}
                    onChange={(ev) => setTexts((prev) => ({ ...prev, [t.id]: ev.target.value.replace(/[^0-9.,\s]/g, '') }))}
                    inputMode="decimal"
                    aria-label={`Montant de ${t.title}`}
                    className={`w-full pl-3 pr-12 py-2.5 rounded-xl bg-slate-100 text-sm font-bold tabular-nums text-right outline-none focus:ring-2 ${
                      amounts[t.id] > 0 ? 'focus:ring-accent' : 'ring-2 ring-red-400'
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-500">{t.currency}</span>
                </div>
              </div>
            ))}
        </div>
      </>
    );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onCancel}>
      <div
        className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="sheet-head flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">Modifier {e.name === NO_NAME ? 'ces opérations' : e.name}</h2>
          <button onClick={onCancel} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block text-xs font-bold text-slate-500 mb-1">Nom</label>
        <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Nom de la personne" className={field} />
        {suggestions.length > 0 && (
          <div className="mt-2">
            <div className="text-[12px] text-slate-500 mb-1.5">C'est la même personne que… (les deux seront regroupées)</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((p) => (
                <button
                  key={p}
                  onClick={() => setName(p)}
                  className="flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-50"
                >
                  <MemberAvatar name={p} color={colorOf(p)} size="xs" />
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {others > 0 && name.trim() && name.trim() !== e.name && (
          <p className="text-[12px] text-slate-500 mt-2">
            Le nom change aussi sur ses {others} opération{others > 1 ? 's' : ''} côté « {r ? 'Je dois' : 'On me doit'} ».
          </p>
        )}

        {section(r ? 'Prêts' : 'Emprunts', e.txs.filter(grows))}
        {section('Remboursements', e.txs.filter((t) => !grows(t)))}

        <div className="mt-4 p-3 rounded-2xl bg-slate-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-600">{r ? 'Il te reste à recevoir' : 'Il te reste à rendre'}</span>
          <span className="text-sm font-extrabold tabular-nums text-slate-900">{money(Math.max(0, left))}</span>
        </div>
        <p className="text-[12px] text-slate-500 mt-2">Changer un montant corrige aussi le solde du portefeuille où l'opération a été notée.</p>

        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-100 text-sm font-bold cursor-pointer">
            Annuler
          </button>
          <button
            onClick={() => onSave(name.trim() || (e.name === NO_NAME ? '' : e.name), amounts)}
            disabled={invalid || (e.name === NO_NAME && !name.trim())}
            className="flex-[2] py-3 rounded-2xl bg-accent text-slate-900 text-sm font-bold cursor-pointer disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};

// Échéance proche ou passée, bien visible ; sinon la date seule
const DueChip: React.FC<{ entry: DebtEntry }> = ({ entry }) => {
  const level = dueLevel(entry);
  const text = level === 'late' ? 'En retard' : level === 'today' ? "Aujourd'hui" : level === 'soon' ? 'Demain' : formatDay(entry.due!);
  const tone = level === 'late' ? 'bg-red-500/15 text-red-600' : level ? 'bg-amber-500/15 text-amber-700' : 'bg-slate-100 text-slate-600';
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${tone}`}>
      <CalendarClock className="w-3 h-3" /> {text}
    </span>
  );
};
