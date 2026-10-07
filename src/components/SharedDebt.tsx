import React, { useState } from 'react';
import { QrButton } from './QrInvite';
import { X, Plus, Undo2, Link2, Share2, Copy, Loader2, Check, Clock, Trash2, Wallet as WalletIcon, LogOut, CircleAlert, Percent, Pencil, ChevronDown } from 'lucide-react';
import { DebtMove, DebtShare, Settings, Wallet } from '../types';
import type { DebtEntry } from '../lib/debts';
import type { SharedDebts } from './DebtsView';
import { convertBetween, formatMoney } from '../lib/money';
import { debtMoneyOut, interestAmount, isLive, moveLabel, movesMoney, shareCurrency, shareTotals } from '../lib/debtShares';
import { copyText, debtInviteUrl, formatCode, shareDebtInvite } from '../lib/invite';
import { frenchError } from './Account';
import { MemberAvatar } from './Members';
import { IconBadge } from './AppIcon';
import { haptic } from '../lib/haptics';

const COLORS = ['#F97316', '#3B82F6', '#EC4899', '#14B8A6', '#8B5CF6', '#EAB308', '#EF4444', '#0EA5E9'];
const colorOf = (name: string) => COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

// Fenêtre posée au-dessus de la fiche (rendue à côté d'elle, pas dedans : l'animation l'y enfermerait)
const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      className="w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-head flex items-center justify-between mb-3">
        <h2 className="text-base font-bold">{title}</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// Fiche d'une dette partagée : le carnet commun, ce qui attend ma réponse, le lien d'invitation
export const SharedDebtDetail: React.FC<{
  entry: DebtEntry;
  share: DebtShare;
  shared: SharedDebts;
  money: (v: number) => string;
  settings: Settings;
  onClose: () => void;
}> = ({ entry: e, share: sh, shared, settings, onClose }) => {
  const me = shared.me;
  const r = sh.side === 'receivable';
  const live = isLive(sh);
  const owner = !sh.ownerId;
  const [adding, setAdding] = useState<DebtMove['kind'] | null>(null);
  const [acting, setActing] = useState<DebtMove | null>(null);
  const [confirming, setConfirming] = useState<DebtMove | null>(null);
  const [linking, setLinking] = useState<DebtMove | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [addingInterest, setAddingInterest] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editingMove, setEditingMove] = useState<DebtMove | null>(null);
  const t = shareTotals(sh, settings);
  // Tout dans la devise de la dette : les deux personnes voient les mêmes chiffres
  const money = (v: number) => formatMoney(v, t.currency);
  const toAnswer = live ? sh.moves.filter((m) => (m.pending && m.recordedBy !== me) || (!!m.deleteRequestedBy && m.deleteRequestedBy !== me)) : [];
  const mineWaiting = live ? sh.moves.filter((m) => m.pending && m.recordedBy === me).length : 0;
  const by = (m: DebtMove) => (m.recordedBy === me ? 'toi' : e.name);
  const signed = (m: DebtMove) => `${m.kind === 'repay' ? '−' : '+'}${formatMoney(m.amount, m.currency)}`;
  const [showPast, setShowPast] = useState(false);
  const currentIds = new Set(t.current.map((m) => m.id));
  const pastMoves = sh.moves.filter((m) => !currentIds.has(m.id));
  const moveRow = (m: DebtMove) => {
              const out = m.kind === 'interest' || debtMoneyOut(sh.side, m.kind);
              return (
                <button
                  key={m.id}
                  onClick={() => setActing(m)}
                  className="w-full flex items-center gap-3 py-2.5 text-left cursor-pointer border-b border-slate-100 last:border-b-0"
                >
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${m.kind === 'repay' ? 'bg-emerald-500/15' : 'bg-slate-100'}`}>
                    {m.kind === 'repay' ? <Undo2 className="w-4 h-4 text-emerald-600" /> : m.kind === 'interest' ? <Percent className="w-4 h-4 text-slate-600" /> : <Plus className="w-4 h-4 text-slate-600" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{m.note || moveLabel(sh.side, m.kind)}</span>
                    <span className="block text-[12px] text-slate-500">
                      {day(m.date)} · noté par {by(m)}
                      {m.txId && ' · dans ton portefeuille'}
                    </span>
                    {live && m.pending && (
                      <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-bold text-amber-700">
                        <Clock className="w-3 h-3" /> {m.recordedBy === me ? `En attente de ${e.name}` : 'À confirmer'}
                      </span>
                    )}
                    {live && m.deleteRequestedBy && (
                      <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-bold text-red-600">
                        <Trash2 className="w-3 h-3" /> Suppression demandée{m.deleteRequestedBy === me ? '' : ` par ${e.name}`}
                      </span>
                    )}
                  </span>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${live && m.pending ? 'text-slate-400' : out ? 'text-slate-900' : 'text-emerald-600'}`}>{signed(m)}</span>
                </button>
              );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
        <div
          className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="sheet-head flex items-center gap-3 mb-3">
            <MemberAvatar name={e.name} color={colorOf(e.name)} size="md" />
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold truncate flex items-center gap-1.5">
                <span className="truncate">{e.name}</span>
                <Link2 className="w-4 h-4 shrink-0 text-slate-400" aria-label="Dette partagée" />
              </div>
              <div className="text-xs text-slate-500">{r ? 'Te doit' : 'Tu lui dois'}</div>
            </div>
            <button onClick={() => setRenaming(true)} className="h-9 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </button>
            <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Où en est le partage */}
          {live ? (
            <div className="mb-3 px-3 py-2.5 rounded-2xl bg-emerald-500/10 text-emerald-700 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" /> Partagée avec {e.name} : chaque mouvement est confirmé par l'autre.
            </div>
          ) : sh.otherLeft ? (
            <div className="mb-3 px-3 py-2.5 rounded-2xl bg-slate-100 text-slate-600 text-xs">
              <b className="text-slate-800">{e.name} ne suit plus cette dette sur Wallo.</b> Elle reste ici avec tout l'historique ; tu la corriges seul.
            </div>
          ) : sh.status === 'declined' ? (
            <div className="mb-3 px-3 py-2.5 rounded-2xl bg-red-50 text-red-600 text-xs">
              <b>{e.name} n'est pas d'accord avec ces montants.</b> Corrige-les si besoin (touche un mouvement), puis renvoie un lien.
            </div>
          ) : (
            <div className="mb-3 px-3 py-2.5 rounded-2xl bg-amber-500/10 text-amber-700 text-xs">
              <b>En attente de {e.name}.</b> Tant que le lien n'est pas accepté, la dette n'est que chez toi.
            </div>
          )}
          {owner && !live && <InviteBlock share={sh} shared={shared} amount={money(Math.max(0, t.left))} again={sh.status !== 'open' || !!sh.otherLeft} />}

          <DebtSummary side={sh.side} total={t.total} interest={t.interest} paid={t.paid} left={t.left} money={money} settings={settings} currency={t.currency} />
          
          {mineWaiting > 0 && (
            <p className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" /> {mineWaiting} mouvement{mineWaiting > 1 ? 's' : ''} noté{mineWaiting > 1 ? 's' : ''} par toi, en attente de {e.name} : pas encore compté{mineWaiting > 1 ? 's' : ''}.
            </p>
          )}

          {/* Ce que l'autre a noté et qui attend ma réponse */}
          {toAnswer.length > 0 && (
            <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
              <div className="text-xs font-bold text-amber-700">À confirmer</div>
              {toAnswer.map((m) => {
                const del = !!m.deleteRequestedBy && m.deleteRequestedBy !== me;
                return (
                  <div key={m.id}>
                    <p className="text-sm text-slate-800">
                      {del ? (
                        <>
                          {e.name} veut supprimer : <b>{moveLabel(sh.side, m.kind).toLowerCase()} de {formatMoney(m.amount, m.currency)}</b> du {day(m.date)}.
                        </>
                      ) : (
                        <>
                          {e.name} a noté : <b>{moveLabel(sh.side, m.kind).toLowerCase()} de {formatMoney(m.amount, m.currency)}</b> le {day(m.date)}.
                        </>
                      )}
                    </p>
                    {m.note && <p className="text-xs text-slate-500 mt-0.5">« {m.note} »</p>}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() =>
                          del ? shared.onAnswerDelete(sh.id, m.id, false) : shared.onRemove(sh.id, m.id, m.kind === 'repay' ? 'Remboursement refusé' : 'Mouvement refusé')
                        }
                        className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 cursor-pointer"
                      >
                        {del ? 'Garder' : m.kind === 'repay' && r ? 'Pas reçu' : 'Refuser'}
                      </button>
                      <button
                        onClick={() =>
                          del
                            ? shared.onAnswerDelete(sh.id, m.id, true)
                            : movesMoney(m.kind)
                              ? setConfirming(m)
                              : shared.onConfirm(sh.id, m.id, null)
                        }
                        className="flex-[1.4] py-2.5 rounded-xl bg-accent text-slate-900 text-sm font-bold cursor-pointer"
                      >
                        {del ? 'Supprimer' : m.kind === 'repay' && r ? "J'ai bien reçu" : 'Confirmer'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DebtActions side={sh.side} showRepay={t.left > 0.004} onRepay={() => setAdding('repay')} onMore={() => setAdding('more')} onInterest={() => setAddingInterest(true)} />

          <div className="text-xs font-bold text-slate-500 mb-1">Historique commun</div>
          {[...t.current].sort((a, b) => b.date.localeCompare(a.date)).map(moveRow)}
          {/* Tours déjà réglés : repliés (un nouveau prêt repart de zéro) */}
          {pastMoves.length > 0 && (
            <>
              <button
                onClick={() => setShowPast((v) => !v)}
                className="w-full mt-3 py-2 flex items-center justify-between text-xs font-bold text-slate-500 cursor-pointer"
              >
                Déjà réglé ({pastMoves.length})
                <ChevronDown className={`w-4 h-4 transition-transform ${showPast ? 'rotate-180' : ''}`} />
              </button>
              {showPast && <div className="opacity-70 animate-fade-in">{[...pastMoves].sort((a, b) => b.date.localeCompare(a.date)).map(moveRow)}</div>}
            </>
          )}
          {sh.moves.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucun mouvement noté.</p>}

          <button
            onClick={() => setLeaving(true)}
            className="w-full mt-4 py-3 rounded-2xl text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Ne plus suivre cette dette
          </button>
        </div>
      </div>

      {adding && (
        <MoveSheet
          share={sh}
          person={e.name}
          kind={adding}
          wallets={shared.wallets}
          settings={settings}
          suggested={adding === 'repay' && t.left > 0.004 ? t.left : undefined}
          onClose={() => setAdding(null)}
          onSave={(m) => {
            shared.onAddMove(sh.id, m);
            setAdding(null);
          }}
        />
      )}

      {renaming && (
        <Sheet title="Modifier" onClose={() => setRenaming(false)}>
          <RenameForm
            name={e.name}
            note={
              live
                ? `Un montant se corrige en touchant la ligne dans l'historique : tant que ${e.name} ne l'a pas confirmé, tu le modifies ; ensuite, demande sa suppression et note-le à nouveau.`
                : "Pour corriger un montant, touche sa ligne dans l'historique."
            }
            onSave={(name) => {
              shared.onRename(sh.id, name);
              setRenaming(false);
            }}
          />
        </Sheet>
      )}

      {editingMove && (
        <MoveEditSheet
          m={editingMove}
          label={moveLabel(sh.side, editingMove.kind)}
          onClose={() => setEditingMove(null)}
          onSave={(changes) => {
            shared.onEditMove(sh.id, editingMove.id, changes);
            setEditingMove(null);
          }}
        />
      )}

      {addingInterest && (
        <InterestSheet
          side={sh.side}
          person={e.name}
          base={t.total}
          currency={t.currency}
          currencies={[...new Set([t.currency, settings.mainCurrency, ...(settings.secondCurrency ? [settings.secondCurrency] : []), ...sh.moves.map((m) => m.currency)])]}
          shared={live}
          existing={sh.moves
            .filter((m) => m.kind === 'interest')
            .map((m) => ({
              id: m.id,
              amount: formatMoney(m.amount, m.currency),
              label: `${day(m.date)} · noté par ${by(m)}${live && m.pending ? ' · en attente' : ''}`,
              // En attente, ou seul à suivre : retiré tout de suite ; confirmé : l'autre doit accepter
              action: !live || m.pending ? 'Retirer' : m.deleteRequestedBy ? undefined : 'Demander à retirer',
            }))}
          onRemove={(id) => {
            const m = sh.moves.find((x) => x.id === id);
            if (!m) return;
            if (!live || m.pending) shared.onRemove(sh.id, id, 'Intérêts retirés');
            else shared.onRequestDelete(sh.id, id);
          }}
          onClose={() => setAddingInterest(false)}
          onSave={(amount, currency) => {
            shared.onAddMove(sh.id, { kind: 'interest', amount, currency, note: 'Intérêts', walletId: null });
            setAddingInterest(false);
          }}
        />
      )}

      {confirming && (
        <WalletPick
          title={confirming.kind === 'repay' && r ? 'Remboursement reçu' : 'Confirmer'}
          text={`${moveLabel(sh.side, confirming.kind)} de ${formatMoney(confirming.amount, confirming.currency)} : le noter aussi dans un de tes portefeuilles ?`}
          out={debtMoneyOut(sh.side, confirming.kind)}
          wallets={shared.wallets}
          onClose={() => setConfirming(null)}
          onPick={(walletId) => {
            haptic('success');
            shared.onConfirm(sh.id, confirming.id, walletId);
            setConfirming(null);
          }}
          skipLabel="Confirmer sans rien noter"
        />
      )}

      {linking && (
        <WalletPick
          title="Noter dans un portefeuille"
          text={`${moveLabel(sh.side, linking.kind)} de ${formatMoney(linking.amount, linking.currency)} : dans quel portefeuille ?`}
          out={debtMoneyOut(sh.side, linking.kind)}
          wallets={shared.wallets}
          onClose={() => setLinking(null)}
          onPick={(walletId) => {
            if (walletId) shared.onLinkWallet(sh.id, linking.id, walletId);
            setLinking(null);
          }}
        />
      )}

      {acting && (
        <MoveActions
          m={acting}
          share={sh}
          person={e.name}
          me={me}
          onClose={() => setActing(null)}
          shared={shared}
          onConfirm={() => {
            setConfirming(acting);
            setActing(null);
          }}
          onLink={() => {
            setLinking(acting);
            setActing(null);
          }}
          onEdit={() => {
            setEditingMove(acting);
            setActing(null);
          }}
        />
      )}

      {leaving && (
        <Sheet title="Ne plus suivre cette dette ?" onClose={() => setLeaving(false)}>
          <p className="text-sm text-slate-600 mb-2">Elle disparaît de ta liste des dettes partagées.</p>
          <p className="text-sm text-slate-600 mb-4">
            {live || sh.otherLeft
              ? `Chez ${e.name}, rien n'est effacé : la dette reste avec tout l'historique.`
              : owner
                ? 'Le lien envoyé ne marchera plus.'
                : ''}{' '}
            Les opérations notées dans tes portefeuilles restent.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setLeaving(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-sm font-semibold cursor-pointer">
              Garder
            </button>
            <button
              onClick={() => {
                haptic('warning');
                shared.onLeave(sh.id);
                setLeaving(false);
                onClose();
              }}
              className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-bold cursor-pointer"
            >
              Ne plus suivre
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
};

// Ce qu'on peut faire d'un mouvement, selon qui l'a noté et s'il est confirmé
const MoveActions: React.FC<{
  m: DebtMove;
  share: DebtShare;
  person: string;
  me: string;
  shared: SharedDebts;
  onClose: () => void;
  onConfirm: () => void;
  onLink: () => void;
  onEdit: () => void;
}> = ({ m, share: sh, person, me, shared, onClose, onConfirm, onLink, onEdit }) => {
  const live = isLive(sh);
  const mine = m.recordedBy === me;
  const btn = 'w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer';
  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <Sheet title={`${moveLabel(sh.side, m.kind)} de ${formatMoney(m.amount, m.currency)}`} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">
        {day(m.date)} · noté par {mine ? 'toi' : person}
        {m.note ? ` · « ${m.note} »` : ''}
        {live && (m.pending ? (mine ? ` · en attente de ${person}` : ' · à confirmer') : ' · confirmé')}
      </p>
      <div className="space-y-2">
        {/* Modifier : mon mouvement pas encore confirmé, ou tout quand je suis seul à suivre */}
        {(!live || (m.pending && mine)) && (
          <button onClick={onEdit} className={`${btn} bg-slate-100`}>
            <Pencil className="w-4 h-4" /> Modifier
          </button>
        )}
        {live && m.pending && !mine && (
          <>
            <button onClick={onConfirm} className={`${btn} bg-accent text-slate-900 font-bold`}>
              <Check className="w-4 h-4" /> Confirmer
            </button>
            <button onClick={done(() => shared.onRemove(sh.id, m.id, 'Mouvement refusé'))} className={`${btn} bg-slate-100 text-red-600`}>
              Refuser
            </button>
          </>
        )}
        {live && m.pending && mine && (
          <button onClick={done(() => shared.onRemove(sh.id, m.id, 'Mouvement annulé'))} className={`${btn} bg-slate-100 text-red-600`}>
            <Trash2 className="w-4 h-4" /> Annuler ce mouvement
          </button>
        )}
        {live && !m.pending && !m.deleteRequestedBy && (
          <>
            <button onClick={done(() => shared.onRequestDelete(sh.id, m.id))} className={`${btn} bg-slate-100 text-red-600`}>
              <Trash2 className="w-4 h-4" /> Demander la suppression
            </button>
            <p className="text-[12px] text-slate-500 text-center">Confirmé par vous deux : il ne disparaît que si {person} accepte.</p>
          </>
        )}
        {live && m.deleteRequestedBy === me && (
          <button onClick={done(() => shared.onAnswerDelete(sh.id, m.id, false))} className={`${btn} bg-slate-100`}>
            Annuler ma demande de suppression
          </button>
        )}
        {live && m.deleteRequestedBy && m.deleteRequestedBy !== me && (
          <>
            <button onClick={done(() => shared.onAnswerDelete(sh.id, m.id, true))} className={`${btn} bg-red-600 text-white font-bold`}>
              Accepter la suppression
            </button>
            <button onClick={done(() => shared.onAnswerDelete(sh.id, m.id, false))} className={`${btn} bg-slate-100`}>
              Garder ce mouvement
            </button>
          </>
        )}
        {!live && (
          <button onClick={done(() => shared.onRemove(sh.id, m.id, 'Mouvement supprimé'))} className={`${btn} bg-slate-100 text-red-600`}>
            <Trash2 className="w-4 h-4" /> Supprimer ce mouvement
          </button>
        )}
        {!m.txId && movesMoney(m.kind) && (mine || !m.pending || !live) && (
          <button onClick={onLink} className={`${btn} bg-slate-100`}>
            <WalletIcon className="w-4 h-4" /> Noter dans un portefeuille
          </button>
        )}
        {m.txId && <p className="text-[12px] text-slate-500 text-center">Noté aussi dans ton portefeuille (Historique).</p>}
      </div>
    </Sheet>
  );
};

// Noter un prêt / un remboursement dans le carnet commun (et, si on veut, dans un portefeuille)
const MoveSheet: React.FC<{
  share: DebtShare;
  person: string;
  kind: DebtMove['kind'];
  wallets: Wallet[];
  settings: Settings;
  suggested?: number;
  onClose: () => void;
  onSave: (m: { kind: DebtMove['kind']; amount: number; currency: string; note?: string; walletId: string | null }) => void;
}> = ({ share: sh, person, kind, wallets, settings, suggested, onClose, onSave }) => {
  // La devise de la dette d'abord : les mouvements restent dans la même devise (mêmes chiffres chez les deux)
  const currencies = [...new Set([shareCurrency(sh, settings.mainCurrency), settings.mainCurrency, ...(settings.secondCurrency ? [settings.secondCurrency] : [])])];
  const [currency, setCurrency] = useState(currencies[0]);
  const [text, setText] = useState(suggested ? String(Math.round(suggested * 100) / 100).replace('.', ',') : '');
  const [note, setNote] = useState('');
  const [walletId, setWalletId] = useState<string | null>(wallets.find((w) => w.currency === currency)?.id ?? wallets[0]?.id ?? null);
  const amount = Number(text.replace(/\s/g, '').replace(',', '.'));
  const out = debtMoneyOut(sh.side, kind);
  const r = sh.side === 'receivable';
  const title = kind === 'repay' ? (r ? `${person} te rembourse` : `Tu rembourses ${person}`) : r ? `Tu prêtes à ${person}` : `Tu empruntes à ${person}`;
  return (
    <Sheet title={title} onClose={onClose}>
      <label className="block text-xs font-semibold text-slate-500 mb-1">Montant</label>
      <div className="flex gap-2 mb-3">
        <input
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(ev) => setText(ev.target.value.replace(/[^0-9.,\s]/g, ''))}
          placeholder="0"
          className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-slate-100 text-lg font-bold tabular-nums outline-none focus:ring-2 focus:ring-accent"
        />
        {currencies.length > 1 ? (
          <select
            value={currency}
            onChange={(ev) => setCurrency(ev.target.value)}
            aria-label="Devise"
            className="px-3 rounded-2xl bg-slate-100 text-sm font-bold outline-none cursor-pointer"
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        ) : (
          <span className="px-3 rounded-2xl bg-slate-100 text-sm font-bold flex items-center">{currency}</span>
        )}
      </div>
      <input
        value={note}
        onChange={(ev) => setNote(ev.target.value)}
        placeholder="Note (facultatif)"
        maxLength={200}
        className="w-full mb-3 px-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
      />
      <div className="text-xs font-semibold text-slate-500 mb-1.5">{out ? 'Sorti de quel portefeuille ?' : 'Reçu dans quel portefeuille ?'}</div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {wallets.map((w) => (
          <button
            key={w.id}
            onClick={() => setWalletId(w.id)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${walletId === w.id ? 'is-selected' : 'bg-slate-100'}`}
          >
            <IconBadge icon={w.icon} image={w.image} color={w.color} size="xs" /> {w.name}
          </button>
        ))}
        <button
          onClick={() => setWalletId(null)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${walletId === null ? 'is-selected' : 'bg-slate-100'}`}
        >
          Aucun
        </button>
      </div>
      <button
        disabled={!(amount > 0)}
        onClick={() => onSave({ kind, amount, currency, note: note.trim() || undefined, walletId })}
        className="w-full py-3.5 rounded-2xl bg-accent disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 text-sm font-bold cursor-pointer disabled:cursor-default"
      >
        {amount > 0 ? `Noter ${formatMoney(amount, currency)}` : 'Indique le montant'}
      </button>
      {isLive(sh) && <p className="text-[12px] text-slate-500 mt-2 text-center">{person} le verra et devra le confirmer avant qu'il compte.</p>}
    </Sheet>
  );
};

// Choisir un portefeuille (ou aucun) pour noter un mouvement de mon côté
const WalletPick: React.FC<{
  title: string;
  text: string;
  out: boolean;
  wallets: Wallet[];
  onClose: () => void;
  onPick: (walletId: string | null) => void;
  skipLabel?: string;
}> = ({ title, text, out, wallets, onClose, onPick, skipLabel }) => (
  <Sheet title={title} onClose={onClose}>
    <p className="text-sm text-slate-600 mb-3">{text}</p>
    <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 mb-3">
      {wallets.map((w) => (
        <button key={w.id} onClick={() => onPick(w.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50">
          <IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />
          <span className="flex-1 text-sm font-semibold text-slate-900 truncate">{w.name}</span>
          <span className="text-[12px] text-slate-500">{out ? 'sortie' : 'entrée'}</span>
        </button>
      ))}
    </div>
    {skipLabel && (
      <button onClick={() => onPick(null)} className="w-full py-3 rounded-2xl bg-slate-100 text-sm font-semibold cursor-pointer">
        {skipLabel}
      </button>
    )}
  </Sheet>
);

// Lien d'invitation (seulement celle ou celui qui a partagé la dette)
const InviteBlock: React.FC<{ share: DebtShare; shared: SharedDebts; amount: string; again: boolean }> = ({ share: sh, shared, amount, again }) => {
  const cloud = shared.cloud;
  const [invite, setInvite] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const send = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const inv = invite ?? (await cloud.createDebtInvite(sh.id));
      setInvite(inv);
      const res = await shareDebtInvite(sh.side, amount, inv.code);
      if (res === 'copied') setNote('Lien copié : colle-le dans WhatsApp ou un SMS.');
      if (res === 'failed') setNote('Envoie ce lien : ' + debtInviteUrl(inv.code));
    } catch (e) {
      setError(frenchError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };
  if (!cloud.user) {
    return (
      <p className="mb-3 text-xs text-slate-500 flex items-start gap-1.5">
        <CircleAlert className="w-4 h-4 shrink-0" /> Connecte-toi (Profil › Se connecter) pour envoyer le lien.
      </p>
    );
  }
  return (
    <div className="mb-3">
      <button
        onClick={send}
        disabled={busy}
        className="w-full py-3 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} {again ? 'Renvoyer un lien' : 'Envoyer le lien'}
      </button>
      <QrButton
        kind="debt"
        getCode={async () => {
          const inv = invite ?? (await cloud.createDebtInvite(sh.id));
          setInvite(inv);
          return inv.code;
        }}
        onError={(e) => setError(frenchError(e instanceof Error ? e.message : String(e)))}
      />
      {invite && (
        <div className="mt-2 flex items-center gap-2 animate-fade-in">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-slate-500">Code (valable 7 jours)</div>
            <div className="text-lg font-extrabold tracking-[0.15em] tabular-nums text-slate-900 select-all">{formatCode(invite.code)}</div>
          </div>
          <button
            onClick={() => copyText(debtInviteUrl(invite.code)).then((ok) => setNote(ok ? 'Lien copié.' : ''))}
            aria-label="Copier le lien"
            className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer hover:bg-slate-200"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      )}
      {note && <p className="text-xs text-emerald-700 mt-2">{note}</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
};

// Ajouter des intérêts : un montant, ou un pourcentage de ce qui a été prêté (ou emprunté)
export const InterestSheet: React.FC<{
  side: DebtShare['side'];
  person: string;
  base: number; // prêté / emprunté, en devise principale
  currency: string; // devise principale
  currencies?: string[]; // devises proposées pour un montant fixe (la principale d'abord)
  shared?: boolean; // l'autre devra confirmer
  // Intérêts déjà notés, qu'on peut retirer (action : texte du bouton, absent = rien à faire)
  existing?: { id: string; label: string; amount: string; action?: string }[];
  onRemove?: (id: string) => void;
  onClose: () => void;
  onSave: (amount: number, currency: string) => void;
}> = ({ side, person, base, currency, currencies = [currency], shared, existing = [], onRemove, onClose, onSave }) => {
  const [text, setText] = useState('');
  // '%' : pourcentage de ce qui a été prêté ; sinon la devise du montant fixe
  const [unit, setUnit] = useState<string>('%');
  const pct = unit === '%';
  const cur = pct ? currency : unit;
  const amount = interestAmount(text, pct, base);
  return (
    <Sheet title={side === 'receivable' ? `Intérêts que ${person} te doit` : `Intérêts que tu dois à ${person}`} onClose={onClose}>
      {existing.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold text-slate-500 mb-1">Déjà notés</div>
          <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100">
            {existing.map((x) => (
              <div key={x.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold tabular-nums text-slate-900">{x.amount}</span>
                  <span className="block text-[12px] text-slate-500 truncate">{x.label}</span>
                </span>
                {x.action ? (
                  <button
                    onClick={() => onRemove?.(x.id)}
                    className="shrink-0 px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-bold cursor-pointer"
                  >
                    {x.action}
                  </button>
                ) : (
                  <span className="shrink-0 text-[12px] text-slate-400">Suppression demandée</span>
                )}
              </div>
            ))}
          </div>
          <div className="text-xs font-bold text-slate-500 mt-4 mb-1">En ajouter</div>
        </div>
      )}
      <div className="flex gap-2 mb-2">
        <input
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(ev) => setText(ev.target.value.replace(/[^0-9.,]/g, ''))}
          placeholder={pct ? 'ex. 10' : 'ex. 10000'}
          className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-slate-100 text-lg font-bold tabular-nums outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="flex shrink-0 p-1 rounded-2xl bg-slate-100" role="group" aria-label="Intérêts en">
          {['%', ...currencies].map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              aria-pressed={unit === u}
              className={`px-3 rounded-xl text-sm font-bold cursor-pointer ${unit === u ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {pct ? `${text || '0'} % de ${formatMoney(base, currency)} (${side === 'receivable' ? 'prêté' : 'emprunté'})` : `Montant fixe en ${cur}`}
        {amount > 0 && <b className="text-slate-800"> = {formatMoney(amount, cur)}</b>}. Ils s'ajoutent au reste à rembourser.
      </p>
      <button
        disabled={!(amount > 0)}
        onClick={() => onSave(amount, cur)}
        className="w-full py-3.5 rounded-2xl bg-accent disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 text-sm font-bold cursor-pointer disabled:cursor-default"
      >
        {amount > 0 ? `Ajouter ${formatMoney(amount, cur)} d'intérêts` : 'Indique les intérêts'}
      </button>
      {shared && <p className="text-[12px] text-slate-500 mt-2 text-center">{person} devra les confirmer avant qu'ils comptent.</p>}
    </Sheet>
  );
};

// Résumé d'une dette : le reste en grand (et dans la 2e devise), une barre, puis prêté / intérêts / remboursé
export const DebtSummary: React.FC<{
  side: DebtShare['side'];
  total: number;
  interest: number;
  paid: number;
  left: number;
  money: (v: number) => string;
  settings: Settings;
  currency?: string; // devise des montants (absent = devise principale)
}> = ({ side, total, interest, paid, left, money, settings, currency = settings.mainCurrency }) => {
  // En dessous, l'équivalent : dans la 2e devise, ou dans la principale si la dette est dans une autre
  const second =
    currency !== settings.mainCurrency ? settings.mainCurrency : settings.secondCurrency && settings.secondCurrency !== currency ? settings.secondCurrency : null;
  const rest = Math.max(0, left);
  const over = left < -0.004;
  const conv = second ? convertBetween(rest, currency, second, settings) : null;
  const due = total + interest;
  const ratio = due > 0 ? Math.min(1, paid / due) : 1;
  const line = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
  return (
    <div className="mb-4">
      <div className="text-center">
        {over ? (
          <>
            {/* Plus de remboursements que de prêts : on le dit, au lieu d'afficher « 0 » */}
            <div className="text-xs font-semibold text-amber-700">Trop remboursé</div>
            <div className="text-3xl font-extrabold tabular-nums text-amber-700 mt-0.5">{money(-left)}</div>
            <p className="text-xs text-slate-500 mt-1.5 max-w-[300px] mx-auto">
              Il manque sans doute {side === 'receivable' ? 'le prêt' : "l'emprunt"} d'origine : ajoute-le avec « {side === 'receivable' ? 'Prêter' : 'Emprunter'} ». Un nouveau{' '}
              {side === 'receivable' ? 'prêt' : 'emprunt'} est d'abord réduit de ce montant.
            </p>
          </>
        ) : (
          <>
            <div className="text-xs font-semibold text-slate-500">{rest > 0.004 ? 'Reste à rembourser' : 'Tout est remboursé'}</div>
            <div className="text-3xl font-extrabold tabular-nums text-slate-900 mt-0.5">{money(rest)}</div>
            {conv !== null && second && rest > 0.004 && <div className="text-sm tabular-nums text-slate-500">≈ {formatMoney(conv, second)}</div>}
          </>
        )}
      </div>
      <div className="h-1.5 mt-3 mb-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 animate-bar" style={{ width: `${ratio * 100}%` }} />
      </div>
      {line(side === 'receivable' ? 'Prêté' : 'Emprunté', money(total))}
      {interest > 0.004 && line('Intérêts', `+ ${money(interest)}`)}
      {line('Remboursé', `− ${money(paid)}`)}
    </div>
  );
};

// Boutons de la fiche : un principal (rembourser), puis une rangée de petits
export const DebtActions: React.FC<{
  side: DebtShare['side'];
  showRepay: boolean;
  onRepay: () => void;
  onMore: () => void;
  onInterest?: () => void;
  onShare?: () => void;
}> = ({ side, showRepay, onRepay, onMore, onInterest, onShare }) => {
  const r = side === 'receivable';
  const small = 'flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer';
  return (
    <div className="mb-5 space-y-2">
      {showRepay && (
        <button onClick={onRepay} className="w-full py-3.5 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">
          <Undo2 className="w-4 h-4" /> {r ? 'Il/elle me rembourse' : 'Je rembourse'}
        </button>
      )}
      <div className="flex gap-2">
        <button onClick={onMore} className={small}>
          <Plus className="w-4 h-4" /> {r ? 'Prêter' : 'Emprunter'}
        </button>
        {onInterest && (
          <button onClick={onInterest} className={small}>
            <Percent className="w-4 h-4" /> Intérêts
          </button>
        )}
        {onShare && (
          <button onClick={onShare} className={small}>
            <Link2 className="w-4 h-4" /> Partager
          </button>
        )}
      </div>
    </div>
  );
};

// Renommer la personne (chez moi)
const RenameForm: React.FC<{ name: string; note: string; onSave: (name: string) => void }> = ({ name: initial, note, onSave }) => {
  const [name, setName] = useState(initial);
  return (
    <>
      <label className="block text-xs font-semibold text-slate-500 mb-1">Nom</label>
      <input
        autoFocus
        value={name}
        onChange={(ev) => setName(ev.target.value)}
        onKeyDown={(ev) => ev.key === 'Enter' && name.trim() && onSave(name)}
        maxLength={80}
        className="w-full mb-3 px-4 py-3 rounded-2xl bg-slate-100 text-base outline-none focus:ring-2 focus:ring-accent"
      />
      <p className="text-xs text-slate-500 mb-4">{note}</p>
      <button
        disabled={!name.trim()}
        onClick={() => onSave(name)}
        className="w-full py-3.5 rounded-2xl bg-accent disabled:opacity-40 text-slate-900 text-sm font-bold cursor-pointer"
      >
        Enregistrer
      </button>
    </>
  );
};

// Corriger le montant (et la note) d'un mouvement
const MoveEditSheet: React.FC<{ m: DebtMove; label: string; onClose: () => void; onSave: (c: { amount: number; note?: string }) => void }> = ({ m, label, onClose, onSave }) => {
  const [text, setText] = useState(String(m.amount).replace('.', ','));
  const [note, setNote] = useState(m.note ?? '');
  const amount = Number(text.replace(/\s/g, '').replace(',', '.'));
  return (
    <Sheet title={`Modifier : ${label.toLowerCase()}`} onClose={onClose}>
      <label className="block text-xs font-semibold text-slate-500 mb-1">Montant ({m.currency})</label>
      <input
        autoFocus
        inputMode="decimal"
        value={text}
        onChange={(ev) => setText(ev.target.value.replace(/[^0-9.,\s]/g, ''))}
        className="w-full mb-3 px-4 py-3 rounded-2xl bg-slate-100 text-lg font-bold tabular-nums outline-none focus:ring-2 focus:ring-accent"
      />
      <input
        value={note}
        onChange={(ev) => setNote(ev.target.value)}
        placeholder="Note (facultatif)"
        maxLength={200}
        className="w-full mb-4 px-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
      />
      <button
        disabled={!(amount > 0)}
        onClick={() => onSave({ amount, note: note.trim() || undefined })}
        className="w-full py-3.5 rounded-2xl bg-accent disabled:opacity-40 text-slate-900 text-sm font-bold cursor-pointer"
      >
        Enregistrer
      </button>
    </Sheet>
  );
};
