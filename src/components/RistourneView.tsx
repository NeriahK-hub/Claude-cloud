import React, { useState } from 'react';
import { QrButton } from './QrInvite';
import { ChevronLeft, ChevronRight, Users, CheckCircle2, Hourglass, ShieldCheck, HandCoins, Clock, Plus, X, Shuffle, ChevronUp, ChevronDown, Trash2, Pencil, Gift, Wallet as WalletIcon, Share2, Copy, Loader2, Link2 } from 'lucide-react';
import type { Cloud } from '../lib/sync/useCloud';
import { askConfirm } from '../lib/confirm';
import { copyText, formatCode, ristourneInviteUrl, shareRistourneInvite } from '../lib/invite';
import { frenchError } from './Account';
import { Ristourne, RistourneMember, Wallet } from '../types';
import { formatMoney } from '../lib/money';
import { activeMembers, beneficiary, canConfirm, currentTurn, FREQUENCIES, frequencyText, holdingText, isFinished, keeperOf, todayIso, turnDate, turnStatus } from '../lib/ristourne';
import { uuid } from '../lib/ids';
import { useProfile } from '../lib/profile';
import { MemberAvatar } from './Members';
import { IconBadge } from './AppIcon';
import { haptic } from '../lib/haptics';
import { DateField } from './DatePicker';
import { SelCheck } from './SelCheck';
import { useIsDesktop } from '../hooks/useIsDesktop';

interface RistourneViewProps {
  ristournes: Ristourne[];
  wallets: Wallet[]; // portefeuilles actifs (pour noter la cotisation / la cagnotte)
  defaultCurrency: string;
  onBack: () => void;
  onCreate: (r: Omit<Ristourne, 'id' | 'payments'>) => string;
  onUpdate: (id: string, changes: Partial<Ristourne>) => void;
  onDelete: (id: string) => void;
  onPay: (r: Ristourne, member: RistourneMember, turn: number, walletId: string | null) => void;
  onUnpay: (r: Ristourne, paymentId: string) => void;
  onConfirm: (r: Ristourne, paymentId: string) => void; // organisateur / gardien : paiement bien reçu
  onReceive: (r: Ristourne, turn: number, walletId: string) => void;
  cloud?: Cloud; // invitations par lien (compte en ligne)
  onJoin?: () => void; // « Rejoindre une ristourne » avec un code reçu
}

const COLORS = ['#F97316', '#3B82F6', '#EC4899', '#14B8A6', '#8B5CF6', '#EAB308', '#EF4444', '#0EA5E9'];
const colorOf = (m: RistourneMember) => (m.isMe ? '#475569' : COLORS[m.turn % COLORS.length]);
const longDate = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const inDays = (d: Date) => {
  const today = new Date();
  const n = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  return n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : n > 0 ? `dans ${n} jours` : `il y a ${-n} jour${n < -1 ? 's' : ''}`;
};

// « J'ai reçu un code » : pour rejoindre sans passer par le lien
// (le lien peut s'ouvrir dans le navigateur au lieu de l'app installée sur l'écran d'accueil)
const JoinCard: React.FC<{ onJoin: () => void; className?: string }> = ({ onJoin, className = '' }) => (
  <button
    onClick={onJoin}
    className={`w-full p-4 rounded-3xl border border-dashed border-slate-300 flex items-center gap-3 text-left cursor-pointer hover:bg-white ${className}`}
  >
    <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
      <Link2 className="w-5 h-5 text-slate-700" />
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-bold text-slate-900">Rejoindre une ristourne</span>
      <span className="block text-xs text-slate-500">Tu as reçu un lien ou un code d'invitation&nbsp;?</span>
    </span>
  </button>
);

// Ristournes : la liste, puis le détail d'une ristourne (tours, paiements)
export const RistourneView: React.FC<RistourneViewProps> = (p) => {
  const desktop = useIsDesktop(); // ordinateur : pas de retour ni de titre en double, contenu sur plusieurs colonnes
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Ristourne | 'new' | null>(null);
  // Une seule ristourne : on l'ouvre directement
  const selected = p.ristournes.find((r) => r.id === (selectedId ?? (p.ristournes.length === 1 ? p.ristournes[0].id : null)));
  const money = (v: number, c: string) => formatMoney(v, c);
  const joinCard = (className?: string) => p.onJoin && p.cloud?.configured && <JoinCard onJoin={p.onJoin} className={className} />;

  const sheet = editing && (
    <RistourneSheet
      ristourne={editing === 'new' ? null : editing}
      defaultCurrency={p.defaultCurrency}
      onClose={() => setEditing(null)}
      onSave={(data) => {
        if (editing === 'new') setSelectedId(p.onCreate(data));
        else p.onUpdate(editing.id, data);
        setEditing(null);
      }}
    />
  );

  if (selected) {
    return (
      <>
        <RistourneDetail
          r={selected}
          {...p}
          onBack={() => (p.ristournes.length > 1 ? setSelectedId(null) : p.onBack())}
          onEdit={() => setEditing(selected)}
          onDelete={() => {
            p.onDelete(selected.id);
            setSelectedId(null);
          }}
        />
        {/* Une seule ristourne : la liste est sautée, on garde l'accès au code ici */}
        {p.ristournes.length === 1 && <div className="px-5 pb-8 -mt-4">{joinCard()}</div>}
        {sheet}
      </>
    );
  }

  return (
    <div className={desktop ? 'max-w-5xl animate-screen' : 'px-5 pt-4 pb-8 animate-screen'}>
      <div className={`${desktop ? 'desk-head' : 'page-head'} flex items-center gap-3 mb-5`}>
        <button onClick={p.onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Ristournes</h1>
        {p.ristournes.length > 0 && (
          <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-accent text-slate-900 text-xs font-bold cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Nouvelle
          </button>
        )}
      </div>

      {p.ristournes.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 text-center">
          <span className="w-14 h-14 mx-auto rounded-full bg-accent/40 flex items-center justify-center mb-3">
            <Users className="w-7 h-7 text-slate-900" />
          </span>
          <h2 className="text-base font-bold text-slate-900">Organise ta ristourne</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Chaque membre cotise le même montant à chaque tour, et la cagnotte revient à un membre différent à chaque fois. Wallo suit qui a payé et qui reçoit.
          </p>
          <button onClick={() => setEditing('new')} className="w-full py-3 rounded-2xl bg-accent text-slate-900 text-sm font-bold cursor-pointer">
            Créer une ristourne
          </button>
        </div>
      ) : (
        <div className={desktop ? 'grid grid-cols-2 gap-3' : 'space-y-2'}>
          {p.ristournes.map((r) => {
            const n = activeMembers(r).length;
            const t = currentTurn(r);
            const st = turnStatus(r, t);
            const b = beneficiary(r, t);
            return (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="w-full text-left bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50"
              >
                <span className="w-11 h-11 rounded-2xl bg-accent flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-slate-900" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-slate-900 truncate">{r.name}</span>
                  <span className="block text-xs text-slate-500 truncate">
                    {isFinished(r) ? 'Terminée' : `Tour ${t} sur ${n} · ${b?.isMe ? 'pour toi' : `pour ${b?.name ?? '—'}`} · ${inDays(turnDate(r, t))}`}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {st.paidCount}/{n} ont payé · {money(r.contribution, r.currency)} chacun
                  </span>
                </span>
                <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
              </button>
            );
          })}
        </div>
      )}
      {joinCard('mt-4')}
      {sheet}
    </div>
  );
};

const RistourneDetail: React.FC<
  RistourneViewProps & { r: Ristourne; onEdit: () => void; onDelete: () => void }
> = ({ r, wallets, onBack, onPay, onUnpay, onConfirm, onReceive, onEdit, onDelete, cloud }) => {
  const now = currentTurn(r);
  const [turn, setTurn] = useState(now);
  const [paying, setPaying] = useState<RistourneMember | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [unpaying, setUnpaying] = useState<{ member: RistourneMember; paymentId: string } | null>(null);
  const [checking, setChecking] = useState<{ member: RistourneMember; paymentId: string } | null>(null); // paiement à confirmer
  const confirmer = canConfirm(r); // organisateur ou gardien de l'argent
  const keeper = keeperOf(r);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const members = activeMembers(r);
  const n = members.length;
  const st = turnStatus(r, turn);
  const b = beneficiary(r, turn);
  const me = members.find((m) => m.isMe);
  const mine = !r.ownerId;
  const money = (v: number) => formatMoney(v, r.currency);
  const date = turnDate(r, turn);
  // Ma part notée (confirmée ou à confirmer) : plus de bouton « J'ai payé »
  const iPaid = me ? (st.paidBy.get(me.id) ?? 0) + (st.pendingBy.get(me.id) ?? 0) >= r.contribution - 0.004 : true;

  return (
    <div className="px-5 pt-4 pb-8 animate-screen">
      <div className="page-head flex items-center gap-3 mb-4">
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-lg font-bold text-slate-900 truncate">{r.name}</h1>
        {mine && (
          <button onClick={onEdit} aria-label="Modifier" className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tour affiché */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 p-1.5 mb-3">
        <button onClick={() => { haptic(); setTurn((t) => Math.max(1, t - 1)); }} disabled={turn <= 1} aria-label="Tour précédent" className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-30">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold text-slate-900">
          Tour {turn} sur {n} {turn === now && !isFinished(r) && <span className="ml-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-accent align-middle">EN COURS</span>}
        </span>
        <button onClick={() => { haptic(); setTurn((t) => Math.min(n, t + 1)); }} disabled={turn >= n} aria-label="Tour suivant" className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-30">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Cagnotte du tour */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 mb-4">
        <div className="text-xs text-slate-500 mb-1">
          {longDate(date)} · {inDays(date)} · {frequencyText(r)}
        </div>
        <div className="text-[30px] font-extrabold tracking-tight tabular-nums text-slate-900">
          {money(st.collected)} <span className="text-base text-slate-400 font-bold">/ {money(st.pot)}</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden my-3">
          <div className="h-full bg-emerald-500 rounded-full animate-bar" style={{ width: `${st.pot ? Math.min(100, (st.collected / st.pot) * 100) : 0}%` }} />
        </div>
        <p className="text-sm text-slate-700">
          {st.paidCount} sur {n} ont payé
          {st.pendingCount > 0 && <span className="text-amber-600"> · {st.pendingCount} à confirmer</span>}. La cagnotte va à{' '}
          <strong>{b?.isMe ? 'toi' : b?.name ?? '—'}</strong>.
        </p>
        {/* Qui garde l'argent, et comment */}
        {keeper && (
          <p className="text-xs text-slate-500 mt-2 flex items-start gap-1.5">
            <HandCoins className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              L'argent est gardé par <b className="text-slate-700">{keeper.isMe ? 'toi' : keeper.name}</b>
              {r.holding ? ` ${holdingText(r)}` : ''}.
            </span>
          </p>
        )}
        {/* Boutons l'un sous l'autre, en pleine largeur : l'icône reste à côté du texte */}
        {((me && !iPaid) || b?.isMe) && (
          <div className="flex flex-col gap-2 mt-4">
            {me && !iPaid && (
              <button onClick={() => setPaying(me)} className="w-full py-3 px-4 rounded-2xl bg-accent font-bold text-sm text-slate-900 flex items-center justify-center gap-2 cursor-pointer">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> J'ai payé ma part · {money(r.contribution)}
              </button>
            )}
            {b?.isMe && (
              <button onClick={() => setReceiving(true)} className="w-full py-3 px-4 rounded-2xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
                <Gift className="w-4 h-4 shrink-0" /> J'ai reçu la cagnotte
              </button>
            )}
          </div>
        )}
      </div>

      {/* Qui a payé ce tour */}
      <h2 className="text-sm font-bold text-slate-900 mb-2">Qui a payé ?</h2>
      <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-100 mb-4">
        {members.map((m) => {
          const paid = (st.paidBy.get(m.id) ?? 0) >= r.contribution - 0.004;
          const payment = r.payments.find((x) => x.turn === turn && x.memberId === m.id);
          const pending = !!payment?.pending;
          // Organisateur / gardien : tout ; un membre : seulement sa propre cotisation
          const tap = () => {
            if (payment && pending) return confirmer ? setChecking({ member: m, paymentId: payment.id }) : m.isMe && setUnpaying({ member: m, paymentId: payment.id });
            if (paid && payment) return (confirmer || m.isMe) && setUnpaying({ member: m, paymentId: payment.id });
            if (confirmer || m.isMe) setPaying(m);
          };
          return (
            <button
              key={m.id}
              onClick={tap}
              className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-slate-50"
            >
              <MemberAvatar name={m.isMe ? 'Moi' : m.name} color={colorOf(m)} size="md" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-900 truncate">
                  {m.isMe ? 'Moi' : m.name}
                  {m.turn === turn && <Gift className="inline w-3.5 h-3.5 ml-1.5 text-amber-600 -mt-0.5" />}
                </span>
                <span className="block text-xs text-slate-400">{m.invited ? 'Invitation envoyée' : `Reçoit au tour ${m.turn}`}</span>
              </span>
              <span
                className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                  paid ? 'bg-emerald-50 text-emerald-700' : pending ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {paid ? <CheckCircle2 className="w-3.5 h-3.5" /> : pending ? <Clock className="w-3.5 h-3.5" /> : <Hourglass className="w-3.5 h-3.5" />}
                {paid ? 'Payé' : pending ? 'À confirmer' : 'En attente'}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-slate-400 -mt-2 mb-4">
        {confirmer
          ? 'Touche un membre pour noter son paiement, confirmer ce qu\'il a déclaré, ou l\'annuler.'
          : `Touche ton nom pour noter ta cotisation : ${keeper?.name ?? "l'organisateur"} la confirmera quand il aura reçu l'argent.`}
      </p>

      {/* Organisateur : inviter les membres par lien (WhatsApp, SMS…) */}
      {mine && cloud?.configured && <RistourneInviteBlock r={r} cloud={cloud} />}

      {/* Calendrier des tours */}
      <h2 className="text-sm font-bold text-slate-900 mb-2">Ordre des tours</h2>
      <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-100 mb-4">
        {members.map((m) => {
          const past = m.turn < now || isFinished(r);
          return (
            <button key={m.id} onClick={() => setTurn(m.turn)} className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-slate-50">
              <span className={`w-7 text-xs font-bold tabular-nums ${past ? 'text-slate-300' : 'text-slate-500'}`}>{m.turn}.</span>
              <span className={`flex-1 text-sm ${past ? 'text-slate-400' : 'text-slate-800'}`}>{m.isMe ? 'Moi' : m.name}</span>
              <span className={`text-xs tabular-nums ${past ? 'text-slate-300' : 'text-slate-500'}`}>{turnDate(r, m.turn).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
              {m.turn === now && !isFinished(r) && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent">En cours</span>}
            </button>
          );
        })}
      </div>

      {confirmDelete ? (
        <div className="p-3 rounded-2xl bg-red-50">
          <p className="text-sm text-slate-700 mb-2">{mine ? 'Supprimer cette ristourne et ses paiements notés ?' : 'Quitter cette ristourne ? Elle disparaîtra de ton téléphone.'}</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold cursor-pointer">
              Annuler
            </button>
            <button onClick={onDelete} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer">
              {mine ? 'Supprimer' : 'Quitter'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="w-full py-3 rounded-2xl bg-white border border-slate-100 text-red-600 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
          <Trash2 className="w-4 h-4" /> {mine ? 'Supprimer la ristourne' : 'Quitter la ristourne'}
        </button>
      )}

      {paying && (
        <WalletChoiceSheet
          title={paying.isMe ? 'Noter ma cotisation' : `${paying.name} a payé`}
          text={
            paying.isMe
              ? `${money(r.contribution)} pour le tour ${turn}. Choisis le portefeuille d'où l'argent est sorti, pour l'enregistrer comme dépense.`
              : `${money(r.contribution)} pour le tour ${turn}.`
          }
          wallets={paying.isMe ? wallets : []}
          allowNone={paying.isMe}
          confirm="Marquer comme payé"
          onClose={() => setPaying(null)}
          onConfirm={(walletId) => {
            onPay(r, paying, turn, walletId);
            setPaying(null);
          }}
        />
      )}
      {/* Organisateur / gardien : ce membre dit avoir payé, l'argent a-t-il bien été reçu ? */}
      {checking && (
        <Sheet title={`${checking.member.name} dit avoir payé`} onClose={() => setChecking(null)}>
          <p className="text-sm text-slate-600 mb-4">
            Cotisation de {money(r.contribution)} pour le tour {turn}. Confirme seulement si l'argent a bien été reçu
            {r.holding === 'digital' ? ' sur le compte' : r.holding === 'cash' ? ' en main' : ''}.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                onConfirm(r, checking.paymentId);
                setChecking(null);
              }}
              className="w-full py-3 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" /> Confirmer : argent reçu
            </button>
            <button
              onClick={() => {
                onUnpay(r, checking.paymentId);
                setChecking(null);
              }}
              className="w-full py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-bold cursor-pointer"
            >
              Refuser : pas reçu
            </button>
          </div>
        </Sheet>
      )}

      {unpaying && (
        <Sheet title="Annuler ce paiement ?" onClose={() => setUnpaying(null)}>
          <p className="text-sm text-slate-500 mb-4">
            Le paiement de {unpaying.member.isMe ? 'ta cotisation' : unpaying.member.name} pour le tour {turn} ne sera plus compté.
            {unpaying.member.isMe && ' La dépense notée dans ton portefeuille pour cette cotisation est retirée aussi.'}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setUnpaying(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-sm font-semibold cursor-pointer">
              Garder
            </button>
            <button
              onClick={() => {
                onUnpay(r, unpaying.paymentId);
                setUnpaying(null);
              }}
              className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-bold cursor-pointer"
            >
              Annuler le paiement
            </button>
          </div>
        </Sheet>
      )}
      {receiving && (
        <WalletChoiceSheet
          title="Cagnotte reçue"
          text={`${money(st.pot)} pour le tour ${turn}. Sur quel portefeuille l'argent est-il arrivé ?`}
          wallets={wallets}
          confirm="Enregistrer le revenu"
          onClose={() => setReceiving(false)}
          onConfirm={(walletId) => {
            if (walletId) onReceive(r, turn, walletId);
            setReceiving(false);
          }}
        />
      )}
    </div>
  );
};

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

// Confirmer un paiement / une cagnotte reçue, et choisir le portefeuille concerné
const WalletChoiceSheet: React.FC<{
  title: string;
  text: string;
  wallets: Wallet[];
  allowNone?: boolean;
  confirm: string;
  onClose: () => void;
  onConfirm: (walletId: string | null) => void;
}> = ({ title, text, wallets, allowNone, confirm, onClose, onConfirm }) => {
  const [walletId, setWalletId] = useState<string | null>(wallets[0]?.id ?? null);
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">{text}</p>
      {wallets.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {wallets.map((w) => (
            <button
              key={w.id}
              onClick={() => setWalletId(w.id)}
              className={`relative min-w-0 flex flex-col items-center gap-1 p-2 rounded-2xl cursor-pointer transition ${walletId === w.id ? 'is-selected' : 'bg-slate-100 hover:bg-slate-200/70'}`}
            >
              {walletId === w.id && <SelCheck />}
              <IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />
              <span className="w-full text-center text-[12px] font-bold truncate">{w.name}</span>
            </button>
          ))}
          {allowNone && (
            <button
              onClick={() => setWalletId(null)}
              className={`relative min-w-0 flex flex-col items-center justify-center gap-1 p-2 rounded-2xl cursor-pointer transition ${walletId === null ? 'is-selected' : 'bg-slate-100 hover:bg-slate-200/70'}`}
            >
              <WalletIcon className="w-5 h-5 text-slate-400" />
              <span className="text-[12px] font-bold text-slate-500 text-center leading-tight">Ne pas noter de dépense</span>
            </button>
          )}
        </div>
      )}
      <button onClick={() => onConfirm(walletId)} className="w-full py-3.5 rounded-2xl bg-accent text-slate-900 text-sm font-bold cursor-pointer">
        {confirm}
      </button>
    </Sheet>
  );
};

// Créer / modifier : nom, cotisation, fréquence, date du 1er tour, membres et ordre
const RistourneSheet: React.FC<{
  ristourne: Ristourne | null;
  defaultCurrency: string;
  onClose: () => void;
  onSave: (r: Omit<Ristourne, 'id' | 'payments'>) => void;
}> = ({ ristourne, defaultCurrency, onClose, onSave }) => {
  const { name: myName } = useProfile();
  const [name, setName] = useState(ristourne?.name ?? '');
  const [amount, setAmount] = useState(ristourne ? String(ristourne.contribution) : '');
  const [frequency, setFrequency] = useState<Ristourne['frequency']>(ristourne?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(ristourne?.startDate ?? todayIso());
  const [daysText, setDaysText] = useState(String(ristourne?.everyDays ?? 3)); // fréquence personnalisée : tous les N jours
  const [keeperId, setKeeperId] = useState<string | undefined>(ristourne?.keeperId); // qui garde l'argent (vide = l'organisateur)
  // Rien de choisi au départ : les ristournes restent synchronisables même sur une base pas encore à jour
  const [holding, setHolding] = useState<Ristourne['holding']>(ristourne?.holding);
  const [holdingDetails, setHoldingDetails] = useState(ristourne?.holdingDetails ?? '');
  const days = Math.round(Number(daysText));
  const daysOk = frequency !== 'custom' || (Number.isFinite(days) && days >= 1 && days <= 365);
  const [members, setMembers] = useState<RistourneMember[]>(
    ristourne ? activeMembers(ristourne) : [{ id: uuid(), name: myName || 'Moi', turn: 1, isMe: true }]
  );
  const removed = ristourne ? ristourne.members.filter((m) => m.removed) : [];
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const currency = ristourne?.currency ?? defaultCurrency;
  const value = parseFloat(amount.replace(/\s/g, '').replace(',', '.'));
  const valid = name.trim() && value > 0 && members.length >= 2 && startDate && daysOk;

  const add = () => {
    const n = newName.trim();
    if (!n) return;
    setMembers((prev) => [...prev, { id: uuid(), name: n, turn: prev.length + 1, contact: newEmail.trim() || undefined }]);
    setNewName('');
    setNewEmail('');
  };
  const move = (i: number, d: -1 | 1) =>
    setMembers((prev) => {
      const out = [...prev];
      [out[i], out[i + d]] = [out[i + d], out[i]];
      return out;
    });
  const shuffle = () => {
    haptic('success');
    setMembers((prev) => [...prev].map((m) => ({ m, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.m));
  };

  const field = 'w-full px-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent';
  const label = 'block text-xs font-semibold text-slate-500 mt-3 mb-1';

  return (
    <Sheet title={ristourne ? 'Modifier la ristourne' : 'Nouvelle ristourne'} onClose={onClose}>
      <label className={label}>Nom</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Ristourne des amis" className={field} />

      <label className={label}>Cotisation ({currency})</label>
      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ex. 20" className={`${field} font-bold tabular-nums`} />
      <label className={label}>1er tour le</label>
      <DateField value={startDate} onChange={setStartDate} shortcuts="start" label="1er tour le" />

      <label className={label}>Fréquence</label>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
        {FREQUENCIES.map((f) => (
          <button
            key={f.id}
            onClick={() => setFrequency(f.id)}
            className={`py-2 rounded-xl text-xs font-semibold cursor-pointer ${frequency === f.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {/* Personnalisée : un tour tous les N jours */}
      {frequency === 'custom' && (
        <div className="mt-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 whitespace-nowrap">Tous les</span>
            <input
              inputMode="numeric"
              value={daysText}
              onChange={(e) => setDaysText(e.target.value.replace(/\D/g, '').slice(0, 3))}
              className={`${field} w-20 text-center font-bold tabular-nums`}
              aria-label="Nombre de jours entre deux tours"
            />
            <span className="text-sm text-slate-600">jour{days > 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[1, 2, 3, 5, 10, 15].map((n) => (
              <button
                key={n}
                onClick={() => setDaysText(String(n))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${days === n ? 'bg-accent text-slate-900' : 'bg-slate-100 text-slate-600'}`}
              >
                {n === 1 ? 'Chaque jour' : `${n} jours`}
              </button>
            ))}
          </div>
          {!daysOk && <p className="text-xs text-amber-600 mt-1">Choisis entre 1 et 365 jours.</p>}
        </div>
      )}

      <div className="flex items-center justify-between mt-4 mb-1">
        <span className="text-xs font-semibold text-slate-500">Membres et ordre des tours</span>
        <button onClick={shuffle} className="flex items-center gap-1 text-xs font-bold text-emerald-700 cursor-pointer">
          <Shuffle className="w-3.5 h-3.5" /> Tirer au sort
        </button>
      </div>
      <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100">
        {members.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2 px-2.5 py-2">
            <span className="w-5 text-xs font-bold text-slate-400 tabular-nums">{i + 1}.</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold truncate">{m.isMe ? `${m.name} (moi)` : m.name}</span>
              {m.contact && <span className="block text-[12px] text-slate-400 truncate">{m.contact}</span>}
            </span>
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${m.name}`} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-30">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => move(i, 1)} disabled={i === members.length - 1} aria-label={`Descendre ${m.name}`} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-30">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {!m.isMe && (
              <button
                onClick={async () => {
                  // Déjà enregistré dans la ristourne : on demande confirmation
                  const saved = ristourne ? activeMembers(ristourne).some((x) => x.id === m.id) : false;
                  const ok =
                    !saved ||
                    (await askConfirm({
                      title: `Retirer ${m.name} de la ristourne ?`,
                      message: "Son tour disparaît et les tours suivants avancent. Ses paiements déjà notés restent dans l'historique. Pense à Enregistrer.",
                      confirmLabel: 'Retirer',
                      danger: true,
                    }));
                  if (ok) setMembers((prev) => prev.filter((x) => x.id !== m.id));
                }}
                aria-label={`Retirer ${m.name}`} className="w-7 h-7 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Nom" className={`${field} flex-1 min-w-0`} />
        <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="E-mail (facultatif)" inputMode="email" className={`${field} flex-1 min-w-0`} />
        <button onClick={add} disabled={!newName.trim()} aria-label="Ajouter le membre" className="w-11 shrink-0 rounded-2xl bg-slate-900 text-white flex items-center justify-center cursor-pointer disabled:opacity-30">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[12px] text-slate-400 mt-2">
        Avec leur e-mail, les membres verront la ristourne en se connectant à Wallo (tu dois être connecté aussi) et pourront noter leurs paiements.
      </p>

      {/* Qui garde la cagnotte, et comment */}
      <label className={label}>Qui garde l'argent ?</label>
      <select
        value={keeperId && members.some((m) => m.id === keeperId) ? keeperId : ''}
        onChange={(e) => setKeeperId(e.target.value || undefined)}
        className={field}
      >
        <option value="">{ristourne?.ownerId ? "L'organisateur" : 'Moi (organisateur)'}</option>
        {members
          .filter((m) => !(m.isMe && !ristourne?.ownerId))
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.isMe ? `${m.name} (moi)` : m.name}
            </option>
          ))}
      </select>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 mt-2">
        {(
          [
            ['cash', 'En main (espèces)'],
            ['digital', 'Sur un compte'],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            onClick={() => setHolding(id)}
            className={`py-2 rounded-xl text-xs font-semibold cursor-pointer ${holding === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
          >
            {text}
          </button>
        ))}
      </div>
      {holding === 'digital' && (
        <input
          value={holdingDetails}
          onChange={(e) => setHoldingDetails(e.target.value.slice(0, 120))}
          placeholder="Compte (ex. M-Pesa 081 234 5678, Rawbank…)"
          className={`${field} mt-2`}
        />
      )}
      <p className="text-[12px] text-slate-400 mt-2">
        Les membres paient à cette personne. Quand un membre note sa cotisation, elle (ou toi) confirme qu'elle a bien reçu l'argent.
      </p>

      <button
        disabled={!valid}
        onClick={() =>
          onSave({
            name: name.trim(),
            contribution: value,
            currency,
            frequency,
            everyDays: frequency === 'custom' ? days : undefined,
            keeperId: keeperId && members.some((m) => m.id === keeperId) ? keeperId : undefined,
            holding,
            holdingDetails: holding === 'digital' ? holdingDetails.trim() || undefined : undefined,
            startDate,
            members: [
              ...members.map((m, i) => ({ ...m, turn: i + 1 })),
              ...removed,
              // membres retirés pendant la modification : gardés comme « retirés » pour l'historique des paiements
              ...(ristourne ? activeMembers(ristourne).filter((m) => !members.some((x) => x.id === m.id)).map((m) => ({ ...m, removed: true })) : []),
            ],
            ownerId: ristourne?.ownerId,
          })
        }
        className="w-full mt-4 py-3.5 rounded-2xl bg-accent disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 text-sm font-bold cursor-pointer"
      >
        {members.length < 2 ? 'Ajoute au moins un autre membre' : !(value > 0) ? 'Saisis la cotisation' : 'Enregistrer'}
      </button>
    </Sheet>
  );
};

// « Inviter par lien » : l'organisateur envoie un lien /t/CODE ; la personne se connecte et rejoint
// (en reprenant la place notée à son nom, ou au dernier tour)
const RistourneInviteBlock: React.FC<{ r: Ristourne; cloud: Cloud }> = ({ r, cloud }) => {
  const [invite, setInvite] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await fn();
    } catch (e) {
      setError(frenchError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };
  const inviteNow = () =>
    run(async () => {
      const inv = invite ?? (await cloud.createRistourneInvite(r.id));
      setInvite(inv);
      const res = await shareRistourneInvite(r.name, inv.code);
      if (res === 'copied') setNote('Lien copié : colle-le dans WhatsApp ou un SMS.');
      if (res === 'failed') setNote('Envoie ce lien aux membres : ' + ristourneInviteUrl(inv.code));
    });

  if (!cloud.user) {
    return (
      <div className="rounded-3xl bg-white border border-slate-100 p-4 mb-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Link2 className="w-4 h-4" /> Inviter les membres par lien
        </div>
        <p className="text-xs text-slate-500 mt-1">Connecte-toi (Profil › Se connecter) pour envoyer un lien : chaque membre suivra les tours et notera ses cotisations depuis son téléphone.</p>
      </div>
    );
  }

  const until = invite && new Date(invite.expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return (
    <div className="rounded-3xl bg-white border border-slate-100 p-4 mb-4">
      <button
        onClick={inviteNow}
        disabled={busy}
        className="w-full py-3 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Inviter des membres par lien
      </button>
      <QrButton
        kind="ristourne"
        name={r.name}
        getCode={async () => {
          const inv = invite ?? (await cloud.createRistourneInvite(r.id));
          setInvite(inv);
          return inv.code;
        }}
        onError={(e) => setError(frenchError(e instanceof Error ? e.message : String(e)))}
      />
      <p className="text-[12px] text-slate-500 mt-2">
        Envoie le lien par WhatsApp : chaque personne se connecte, choisit son nom dans la liste (ou s'ajoute au dernier tour), puis voit la ristourne sur son téléphone.
      </p>
      {invite && (
        <div className="mt-3 pt-3 border-t border-slate-100 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-slate-500">Code</div>
              <div className="text-lg font-extrabold tracking-[0.15em] tabular-nums text-slate-900 select-all">{formatCode(invite.code)}</div>
            </div>
            <button
              onClick={() => copyText(ristourneInviteUrl(invite.code)).then((ok) => setNote(ok ? 'Lien copié.' : ''))}
              aria-label="Copier le lien"
              className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer hover:bg-slate-200"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 text-[12px]">
            <span className="text-slate-500">Valable jusqu'au {until}</span>
            <button
              onClick={() =>
                run(async () => {
                  await cloud.revokeRistourneInvites(r.id);
                  setInvite(null);
                  setNote('Lien annulé : il ne marche plus.');
                })
              }
              disabled={busy}
              className="font-bold text-red-600 cursor-pointer"
            >
              Annuler le lien
            </button>
          </div>
        </div>
      )}
      {note && <p className="text-xs text-emerald-700 mt-2">{note}</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
};
